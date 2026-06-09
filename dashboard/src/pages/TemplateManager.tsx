import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query } from 'firebase/firestore';
import { db } from '../firebase';

export interface PaquetePlantillas {
  id_paquete: string;
  nombre: string;
  plantillas: string[];
}

export default function TemplateManager() {
  const [paquetes, setPaquetes] = useState<PaquetePlantillas[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const [formData, setFormData] = useState<PaquetePlantillas>({
    id_paquete: '',
    nombre: '',
    plantillas: ['']
  });

  const fetchPaquetes = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'paquetes_plantillas'));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id_paquete: doc.id, ...doc.data() } as PaquetePlantillas));
      setPaquetes(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPaquetes();
  }, []);

  const handleOpenModal = (paquete?: PaquetePlantillas) => {
    if (paquete) {
      setFormData(paquete);
    } else {
      setFormData({ id_paquete: '', nombre: '', plantillas: [''] });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = { nombre: formData.nombre, plantillas: formData.plantillas.filter((p: string) => p.trim() !== '') };
      
      if (formData.id_paquete) {
        await updateDoc(doc(db, 'paquetes_plantillas', formData.id_paquete), payload);
      } else {
        await addDoc(collection(db, 'paquetes_plantillas'), payload);
      }
      setIsModalOpen(false);
      fetchPaquetes();
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este paquete? No se podrá recuperar.')) return;
    try {
      await deleteDoc(doc(db, 'paquetes_plantillas', id));
      fetchPaquetes();
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Gestor de Plantillas</h1>
            <p className="text-gray-400">Creá paquetes con múltiples variantes de diseño para tus clientes.</p>
          </div>
          <button 
            onClick={() => handleOpenModal()} 
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
          >
            + Nuevo Paquete
          </button>
        </div>

        <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {paquetes.map(pkg => (
            <div key={pkg.id_paquete} className="bg-gray-800 rounded-xl p-6 border border-gray-700 hover:border-gray-600 transition-colors">
              <h3 className="text-xl font-bold text-white mb-2">{pkg.nombre}</h3>
              <p className="text-gray-400 mb-6">{pkg.plantillas.length} variantes incluidas</p>
              <div className="flex justify-end space-x-3">
                <button onClick={() => handleOpenModal(pkg)} className="text-blue-400 hover:text-blue-300">Editar</button>
                <button onClick={() => handleDelete(pkg.id_paquete)} className="text-red-400 hover:text-red-300">Eliminar</button>
              </div>
            </div>
          ))}
          {paquetes.length === 0 && !loading && (
            <div className="col-span-full text-center text-gray-500 py-10">No hay paquetes creados todavía.</div>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-gray-800 rounded-xl p-8 max-w-3xl w-full my-8 border border-gray-700">
            <h2 className="text-2xl font-bold text-white mb-6">{formData.id_paquete ? 'Editar Paquete' : 'Nuevo Paquete'}</h2>
            
            <form onSubmit={handleSave} className="space-y-6">
              <div>
                <label className="block text-gray-400 mb-1">Nombre del Paquete</label>
                <input 
                  type="text" 
                  required 
                  value={formData.nombre} 
                  onChange={e => setFormData({ ...formData, nombre: e.target.value })} 
                  className="w-full bg-gray-700 text-white p-3 rounded border border-gray-600 focus:border-blue-500 outline-none" 
                  placeholder="Ej: Pack Premium 8 Diseños"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-gray-400">Plantillas HTML (Variantes)</label>
                  <button 
                    type="button" 
                    onClick={() => setFormData({ ...formData, plantillas: [...formData.plantillas, ''] })} 
                    className="text-sm bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-white"
                  >
                    + Agregar Variante
                  </button>
                </div>
                
                <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2">
                  {formData.plantillas.map((html: string, idx: number) => (
                    <div key={idx} className="relative">
                      <div className="absolute top-2 right-2 flex space-x-2">
                        <span className="text-xs text-gray-500 bg-gray-800 px-2 rounded">#{idx + 1}</span>
                        {formData.plantillas.length > 1 && (
                          <button 
                            type="button" 
                            onClick={() => {
                              const newPlantillas = [...formData.plantillas];
                              newPlantillas.splice(idx, 1);
                              setFormData({ ...formData, plantillas: newPlantillas });
                            }} 
                            className="text-xs text-red-400 hover:text-red-300 bg-gray-800 px-2 rounded"
                          >
                            Eliminar
                          </button>
                        )}
                      </div>
                      <textarea 
                        value={html} 
                        onChange={e => {
                          const newPlantillas = [...formData.plantillas];
                          newPlantillas[idx] = e.target.value;
                          setFormData({ ...formData, plantillas: newPlantillas });
                        }} 
                        className="w-full bg-gray-900 text-green-400 p-4 rounded border border-gray-700 focus:border-blue-500 outline-none font-mono text-sm min-h-[200px]" 
                        placeholder="Pegá el HTML acá..." 
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end space-x-4 pt-4 border-t border-gray-700">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-2 rounded text-gray-400 hover:text-white transition-colors">Cancelar</button>
                <button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2 rounded-lg font-medium transition-colors">
                  {loading ? 'Guardando...' : 'Guardar Paquete'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
