import React, { useEffect, useState } from 'react';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { signOut } from 'firebase/auth';
import { db, storage, auth } from '../lib/firebase';
import { XCircle, Loader2, Upload, BrainCircuit, Settings, LogOut, LayoutTemplate, Trash2 } from 'lucide-react';

interface MarcaConfig {
  id_marca: string;
  nombre_comercial: string;
  rubro: string;
  tono_de_voz: string;
  criterio_ia: string;
  carpeta_drive_id?: string;
  google_sheet_id?: string;
  google_doc_id?: string;
  identidad_visual: {
    logo_url?: string;
  };
  credenciales_redes?: {
    telegram_chat_id?: string;
  };
  plantillas?: string[];
}

export default function AdminDashboard() {
  const [marcas, setMarcas] = useState<MarcaConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>('');

  // Modal IA Criterio state
  const [showIaModal, setShowIaModal] = useState(false);
  const [selectedMarca, setSelectedMarca] = useState<MarcaConfig | null>(null);

  // Modal form state
  const [formData, setFormData] = useState<MarcaConfig>({
    id_marca: '',
    nombre_comercial: '',
    rubro: '',
    tono_de_voz: 'Profesional pero cercano',
    criterio_ia: '',
    carpeta_drive_id: '',
    google_sheet_id: '',
    google_doc_id: '',
    identidad_visual: {
      logo_url: ''
    },
    credenciales_redes: {
      telegram_chat_id: ''
    },
    plantillas: []
  });

  const fetchMarcas = async () => {
    setLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, "marcas"));
      const docs: MarcaConfig[] = [];
      querySnapshot.forEach((doc) => {
        docs.push(doc.data() as MarcaConfig);
      });
      setMarcas(docs);
    } catch (error) {
      console.error("Error fetching marcas:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMarcas();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.id_marca) return alert("Falta el ID de la marca");
    
    setSaving(true);
    try {
      let finalLogoUrl = formData.identidad_visual.logo_url;

      if (logoFile) {
        const fileRef = ref(storage, `logos/${formData.id_marca}/${logoFile.name}`);
        await uploadBytes(fileRef, logoFile);
        finalLogoUrl = await getDownloadURL(fileRef);
      }

      const marcaRef = doc(db, "marcas", formData.id_marca);
      await setDoc(marcaRef, {
        ...formData,
        identidad_visual: {
          ...formData.identidad_visual,
          logo_url: finalLogoUrl
        }
      });
      setShowModal(false);
      setFormData({
        id_marca: '', nombre_comercial: '', rubro: '', tono_de_voz: 'Profesional pero cercano', criterio_ia: '',
        carpeta_drive_id: '', google_sheet_id: '', google_doc_id: '',
        identidad_visual: { logo_url: '' },
        credenciales_redes: { telegram_chat_id: '' },
        plantillas: []
      });
      setLogoFile(null);
      setLogoPreview('');
      fetchMarcas();
    } catch (error) {
      console.error("Error guardando la marca:", error);
      alert("Hubo un error al guardar la PyME.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveIaCriterio = async () => {
    if (!selectedMarca) return;
    setSaving(true);
    try {
      const marcaRef = doc(db, "marcas", selectedMarca.id_marca);
      await setDoc(marcaRef, { criterio_ia: selectedMarca.criterio_ia }, { merge: true });
      setShowIaModal(false);
      setSelectedMarca(null);
      fetchMarcas();
    } catch (error) {
      console.error("Error guardando criterio IA:", error);
      alert("Hubo un error al guardar.");
    } finally {
      setSaving(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      setLogoPreview(URL.createObjectURL(file));
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Administrador de Marcas</h1>
            <p className="text-gray-400">Panel de control de clientes SaaS.</p>
          </div>
          <div className="flex space-x-4 items-center">
            <button 
              onClick={() => setShowModal(true)} 
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              + Nueva PyME
            </button>
            <button 
              onClick={() => signOut(auth)}
              title="Cerrar sesión"
              className="bg-gray-800 hover:bg-red-900/50 border border-gray-700 hover:border-red-700 text-gray-400 hover:text-red-400 p-3 rounded-lg transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="animate-spin text-blue-500" size={40} />
          </div>
        ) : (
          <div className="grid gap-6">
            {marcas.length === 0 ? (
              <div className="bg-gray-800 p-10 rounded-xl text-center border border-gray-700">
                <p className="text-gray-400 text-lg">Todavía no tenés ninguna PyME registrada.</p>
              </div>
            ) : (
              marcas.map((marca) => (
                <div key={marca.id_marca} className="bg-gray-800 p-6 rounded-xl border border-gray-700 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-lg">
                  <div className="flex items-center gap-4">
                    {marca.identidad_visual?.logo_url ? (
                      <img src={marca.identidad_visual.logo_url} alt="Logo" className="w-16 h-16 object-contain rounded-lg bg-gray-700 p-1" />
                    ) : (
                      <div className="w-16 h-16 bg-gray-700 rounded-lg flex items-center justify-center text-gray-400">Sin logo</div>
                    )}
                    <div>
                      <h2 className="text-2xl font-bold text-white">{marca.nombre_comercial}</h2>
                      <div className="text-gray-400 text-sm mt-1 flex flex-wrap gap-3">
                        <span className="bg-gray-700 px-2 py-1 rounded text-xs">ID: {marca.id_marca}</span>
                        <span className="bg-gray-700 px-2 py-1 rounded text-xs">{marca.rubro}</span>
                        <span className="font-semibold text-white">ID Sheet:</span> {marca.google_sheet_id ? <span className="text-blue-400 font-mono">{marca.google_sheet_id.substring(0, 8)}...</span> : <span className="text-yellow-500 italic">No configurado</span>}
                        <span className="font-semibold text-white ml-2">ID Doc:</span> {marca.google_doc_id ? <span className="text-blue-400 font-mono">{marca.google_doc_id.substring(0, 8)}...</span> : <span className="text-yellow-500 italic">No conf.</span>}
                        <span className="font-semibold text-white ml-2">Telegram:</span> {marca.credenciales_redes?.telegram_chat_id ? <span className="text-green-400 font-bold">✓ Vinculado</span> : <span className="text-red-400 italic">Sin vincular</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => {
                        if (window.confirm("¿Estás seguro que deseas eliminar a " + marca.nombre_comercial + "? Esto no se puede deshacer.")) {
                          setSaving(true);
                          import('firebase/firestore').then(({ deleteDoc, doc }) => {
                            deleteDoc(doc(db, "marcas", marca.id_marca))
                              .then(() => fetchMarcas())
                              .catch(err => alert("Error eliminando: " + err.message))
                              .finally(() => setSaving(false));
                          });
                        }
                      }}
                      className="flex items-center justify-center p-2 bg-red-600/20 text-red-500 hover:bg-red-600 hover:text-white rounded-lg transition"
                      title="Eliminar PyME"
                      disabled={saving}
                    >
                      <Trash2 size={18} />
                    </button>
                    <button 
                      onClick={() => {
                        setFormData(marca);
                        setLogoPreview(marca.identidad_visual?.logo_url || '');
                        setShowModal(true);
                      }}
                      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition"
                      title="Editar configuración de la PyME"
                    >
                      <Settings size={18} />
                      Editar
                    </button>
                    <button 
                      onClick={() => window.location.href=`/templates/${marca.id_marca}`}
                      className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg transition"
                      title="Administrar plantillas HTML del cliente"
                    >
                      <LayoutTemplate size={18} />
                      Plantillas
                    </button>
                    <button 
                      onClick={() => { setSelectedMarca(marca); setShowIaModal(true); }}
                      className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition"
                      title="Ver y editar Criterio IA"
                    >
                      <BrainCircuit size={18} />
                      Criterios IA
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Modal Criterio IA */}
        {showIaModal && selectedMarca && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-gray-800 rounded-2xl w-full max-w-3xl border border-gray-700 shadow-2xl">
              <div className="p-6 border-b border-gray-700 flex justify-between items-center bg-gray-800 rounded-t-2xl">
                <h2 className="text-2xl font-bold flex items-center gap-2"><BrainCircuit className="text-purple-400"/> Criterios IA: {selectedMarca.nombre_comercial}</h2>
                <button onClick={() => { setShowIaModal(false); setSelectedMarca(null); }} className="text-gray-400 hover:text-white">
                  <XCircle size={24} />
                </button>
              </div>
              <div className="p-6">
                <p className="text-gray-400 text-sm mb-4">Acá podés auditar o modificar lo que la IA entiende sobre la marca y qué criterios usará para buscar tendencias y planificar el contenido.</p>
                <textarea 
                  value={selectedMarca.criterio_ia || ''} 
                  onChange={(e) => setSelectedMarca({...selectedMarca, criterio_ia: e.target.value})} 
                  className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-purple-500 outline-none h-[300px] resize-y font-mono text-sm leading-relaxed" 
                  placeholder="La IA guardará automáticamente su análisis aquí. O podés escribirlo vos manualmente..." 
                />
              </div>
              <div className="p-6 border-t border-gray-700 flex justify-end gap-3 bg-gray-800 rounded-b-2xl">
                <button type="button" onClick={() => { setShowIaModal(false); setSelectedMarca(null); }} className="px-5 py-2 rounded-lg text-gray-300 hover:bg-gray-700 transition" disabled={saving}>Cancelar</button>
                <button type="button" onClick={handleSaveIaCriterio} disabled={saving} className="flex items-center justify-center gap-2 px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold transition disabled:opacity-50">
                  {saving ? <Loader2 size={18} className="animate-spin" /> : null}
                  {saving ? 'Guardando...' : 'Guardar Criterios'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Nueva PyME */}
        {showModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-gray-700 shadow-2xl">
              <div className="p-6 border-b border-gray-700 flex justify-between items-center sticky top-0 bg-gray-800 z-10">
                <h2 className="text-2xl font-bold">Registrar Nueva PyME</h2>
                <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white">
                  <XCircle size={24} />
                </button>
              </div>
              
              <form onSubmit={handleSubmit} className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Nombre Comercial</label>
                    <input required type="text" value={formData.nombre_comercial} onChange={(e) => setFormData({...formData, nombre_comercial: e.target.value})} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Ej: Carnicería Pepe" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">ID (Slug único sin espacios)</label>
                    <input required type="text" value={formData.id_marca} onChange={(e) => setFormData({...formData, id_marca: e.target.value.toLowerCase().replace(/\s+/g, '_')})} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Ej: carniceria_pepe" />
                  </div>
                  <div>
                    <label className="block text-gray-400 mb-1">ID Carpeta Drive (Opcional)</label>
                    <input type="text" value={formData.carpeta_drive_id || ''} onChange={e => setFormData({ ...formData, carpeta_drive_id: e.target.value })} className="w-full bg-gray-700 text-white p-3 rounded border border-gray-600 focus:border-blue-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-gray-400 mb-1">ID Google Sheet (Grilla Mensual)</label>
                    <input 
                      type="text" 
                      value={formData.google_sheet_id || ''} 
                      onChange={e => {
                        let val = e.target.value;
                        const match = val.match(/\/d\/([a-zA-Z0-9-_]+)/);
                        if (match && match[1]) val = match[1];
                        setFormData({ ...formData, google_sheet_id: val });
                      }} 
                      className="w-full bg-gray-700 text-white p-3 rounded border border-gray-600 focus:border-blue-500 outline-none" 
                    />
                  </div>
                  <div>
                    <label className="block text-gray-400 mb-1">ID Google Doc (Guiones de Reels)</label>
                    <input 
                      type="text" 
                      value={formData.google_doc_id || ''} 
                      onChange={e => {
                        let val = e.target.value;
                        const match = val.match(/\/d\/([a-zA-Z0-9-_]+)/);
                        if (match && match[1]) val = match[1];
                        setFormData({ ...formData, google_doc_id: val });
                      }} 
                      className="w-full bg-gray-700 text-white p-3 rounded border border-gray-600 focus:border-blue-500 outline-none" 
                    />
                  </div>
                  
                  

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-300 mb-1">Rubro / Contexto de la Marca (Instrucciones para la IA)</label>
                    <textarea required value={formData.rubro} onChange={(e) => setFormData({...formData, rubro: e.target.value})} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none min-h-[100px] resize-y" placeholder="Ej: Es una carnicería boutique en el barrio de Palermo..." />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-300 mb-1">Tono de Voz</label>
                    <input required type="text" value={formData.tono_de_voz} onChange={(e) => setFormData({...formData, tono_de_voz: e.target.value})} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Ej: Amigable, chistoso, directo" />
                  </div>
                  
                  <div className="md:col-span-2 bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                    <h3 className="text-lg font-semibold mb-4">Identidad Visual</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-300 mb-1">Logo de la Marca</label>
                        <div className="flex items-center justify-center w-full">
                          <label htmlFor="dropzone-file" className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-600 border-dashed rounded-lg cursor-pointer bg-gray-700/50 hover:bg-gray-700 overflow-hidden relative">
                            {logoPreview || formData.identidad_visual.logo_url ? (
                              <div className="flex flex-col items-center justify-center p-2">
                                <img src={logoPreview || formData.identidad_visual.logo_url} className="h-20 object-contain mb-2" alt="Preview" />
                                <span className="text-xs text-gray-400">Clic para cambiar</span>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                <Upload className="w-8 h-8 mb-2 text-gray-400" />
                                <p className="mb-2 text-sm text-gray-400"><span className="font-semibold">Hacé clic para subir</span> o arrastrá el archivo</p>
                              </div>
                            )}
                            <input id="dropzone-file" type="file" className="hidden" accept="image/png, image/jpeg" onChange={handleFileChange} />
                          </label>
                        </div>
                      </div>

                    </div>
                  </div>

                </div>

                <div className="pt-4 border-t border-gray-700 flex justify-end gap-3">
                  <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2 rounded-lg text-gray-300 hover:bg-gray-700 transition" disabled={saving}>Cancelar</button>
                  <button type="submit" disabled={saving} className="flex items-center justify-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed">
                    {saving ? <Loader2 size={18} className="animate-spin" /> : null}
                    {saving ? 'Guardando...' : 'Guardar Cliente'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
