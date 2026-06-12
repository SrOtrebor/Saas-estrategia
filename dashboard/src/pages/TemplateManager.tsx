import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, ArrowLeft } from 'lucide-react';

export default function TemplateManager() {
  const { id_marca } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [nombreMarca, setNombreMarca] = useState('');
  const [plantillas, setPlantillas] = useState<string[]>(['']);

  useEffect(() => {
    const fetchMarca = async () => {
      if (!id_marca) return;
      try {
        const docRef = doc(db, 'marcas', id_marca);
        const snapshot = await getDoc(docRef);
        if (snapshot.exists()) {
          const data = snapshot.data();
          setNombreMarca(data.nombre_comercial || id_marca);
          if (data.plantillas && data.plantillas.length > 0) {
            setPlantillas(data.plantillas);
          }
        } else {
          alert('No se encontró el cliente');
          navigate('/admin');
        }
      } catch (error) {
        console.error(error);
      } finally {
        setInitialLoading(false);
      }
    };
    fetchMarca();
  }, [id_marca, navigate]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const regex = /<!DOCTYPE html>[\s\S]*?<\/html>/gi;
        const matches = content.match(regex);
        if (matches && matches.length > 0) {
          const actuales = plantillas.filter(p => p.trim() !== '');
          setPlantillas([...actuales, ...matches]);
          alert(`¡Se extrajeron e importaron ${matches.length} variantes con éxito!`);
        } else {
          alert('No se encontraron plantillas válidas en el archivo.');
        }
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id_marca) return;
    setLoading(true);
    try {
      const plantillasFiltradas = plantillas.filter((p: string) => p.trim() !== '');
      
      const MAX_SIZE_BYTES = 512 * 1024;
      const plantillaGrande = plantillasFiltradas.find((p: string) => new Blob([p]).size > MAX_SIZE_BYTES);
      if (plantillaGrande) {
        alert('Una o más plantillas superan el límite de 500KB. Reducí el tamaño del HTML.');
        setLoading(false);
        return;
      }

      await updateDoc(doc(db, 'marcas', id_marca), { plantillas: plantillasFiltradas });
      alert('Plantillas guardadas correctamente.');
      navigate('/admin');
    } catch (error) {
      console.error(error);
      alert('Error guardando plantillas');
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex justify-center items-center">
        <Loader2 className="animate-spin text-blue-500" size={40} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <button 
          onClick={() => navigate('/admin')} 
          className="flex items-center text-gray-400 hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft size={20} className="mr-2" /> Volver al panel
        </button>
        
        <div className="bg-gray-800 rounded-xl p-8 border border-gray-700 shadow-xl">
          <div className="mb-6 border-b border-gray-700 pb-4">
            <h1 className="text-3xl font-bold text-white mb-2">Plantillas de {nombreMarca}</h1>
            <p className="text-gray-400">Edita el código HTML de los diseños que se usarán exclusivamente para este cliente.</p>
          </div>

          <form onSubmit={handleSave} className="space-y-6">
            <div>
              <div className="flex justify-between items-center mb-4">
                <label className="block text-gray-300 font-medium text-lg">Variantes HTML</label>
                <div className="flex space-x-3">
                  <label className="flex items-center bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg text-white font-medium cursor-pointer transition-colors shadow-sm">
                    Importar desde HTML
                    <input type="file" accept=".html" className="hidden" onChange={handleFileUpload} />
                  </label>
                  <button 
                    type="button" 
                    onClick={() => setPlantillas([...plantillas, ''])} 
                    className="flex items-center bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-white font-medium transition-colors"
                  >
                    + Agregar Variante
                  </button>
                </div>
              </div>
              
              <div className="space-y-6">
                {plantillas.map((html: string, idx: number) => (
                  <div key={idx} className="relative bg-gray-900 rounded-lg p-4 border border-gray-700">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-bold text-gray-400">Variante #{idx + 1}</span>
                      {plantillas.length > 1 && (
                        <button 
                          type="button" 
                          onClick={() => {
                            const nuevas = [...plantillas];
                            nuevas.splice(idx, 1);
                            setPlantillas(nuevas);
                          }} 
                          className="text-xs text-red-400 hover:text-red-300 bg-gray-800 px-3 py-1 rounded-md transition-colors"
                        >
                          Eliminar
                        </button>
                      )}
                    </div>
                    <textarea 
                      value={html} 
                      onChange={e => {
                        const nuevas = [...plantillas];
                        nuevas[idx] = e.target.value;
                        setPlantillas(nuevas);
                      }} 
                      className="w-full bg-gray-950 text-green-400 p-4 rounded-lg border border-gray-800 focus:border-blue-500 outline-none font-mono text-sm min-h-[300px] resize-y" 
                      placeholder="<!DOCTYPE html>&#10;<html>&#10;...&#10;</html>" 
                    />
                  </div>
                ))}
                {plantillas.length === 0 && (
                  <div className="text-center py-10 bg-gray-900 rounded-lg border border-gray-800 text-gray-500">
                    No hay plantillas. Agrega una nueva variante o importa un archivo HTML.
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-6 border-t border-gray-700">
              <button type="submit" disabled={loading} className="flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-bold text-lg transition-colors shadow-lg disabled:opacity-50 min-w-[200px]">
                {loading ? <Loader2 size={24} className="animate-spin mr-2" /> : null}
                {loading ? 'Guardando...' : 'Guardar Plantillas'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
