// Carga las variables de entorno definidas en un archivo .env hacia process.env
import 'dotenv/config';

// Importa la clase principal para crear y configurar el servidor MCP (Model Context Protocol)
import { McpServer } from '@modelcontextprotocol/server';

// Importa el transporte que permite al servidor comunicarse mediante entrada/salida estándar (consola/terminal)
import { serveStdio } from '@modelcontextprotocol/server/stdio';

// Importa la función para inicializar la conexión con la base de datos de Supabase
import { createClient } from '@supabase/supabase-js';

// Importa la librería Zod (v4) para validar los esquemas y tipos de datos de entrada
import * as z from 'zod/v4';

// Extrae mediante desestructuración la URL y la clave pública de Supabase desde las variables de entorno
const { EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_KEY } = process.env;

// Verifica si alguna de las dos credenciales falta o está vacía
if (!EXPO_PUBLIC_SUPABASE_URL || !EXPO_PUBLIC_SUPABASE_KEY) {
  // Muestra un mensaje de error en la consola indicando que faltan variables
  console.error('Revisa las variables del archivo .env');
  // Detiene la ejecución del programa inmediatamente con un código de fallo (1)
  process.exit(1);
}

// Crea e inicializa el cliente de Supabase usando las credenciales validadas
const supabase = createClient(
  EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_KEY
);

// Define un arreglo constante con los estados válidos permitidos (útil para validaciones posteriores)
const estados = ['pendiente', 'en_progreso', 'completada'];

// Función auxiliar que recibe unos datos y los formatea en la estructura estándar de respuesta de MCP
const exito = (datos) => {
  return {
    // Devuelve un arreglo de contenido de tipo texto, convirtiendo los datos a un JSON legible (indentado con 2 espacios)
    content: [{ type: 'text', text: JSON.stringify(datos, null, 2) }]
  };
};

// Define la función encargada de construir y configurar la instancia del servidor MCP
function crearServidor() {
    // Crea una nueva instancia de McpServer asignándole un nombre identificador y una versión
    const server = new McpServer({
        name: 'taller-supabase', version: '1.0.0'
    });

    // Registra una nueva herramienta (tool) llamada 'listar_tareas' que la IA podrá invocar
    server.registerTool('listar_tareas', {
        // Explica al modelo de IA qué hace esta herramienta para que sepa cuándo usarla
        description: 'Lista las tareas de Supabase y filtra por estado',
        // Define y valida los parámetros de entrada esperados usando Zod
        inputSchema: z.object({
            // 'estado' es opcional y solo acepta valores incluidos en el arreglo 'estados'
            estado: z.enum(estados).optional(),
            // 'limite' debe ser un número entero entre 1 y 30; si no se envía, toma 10 por defecto
            limite: z.number().int().min(1).max(30).default(10)
        })
    // Función asíncrona que ejecuta la lógica cuando se llama a la herramienta, recibiendo los parámetros validados
    }, async ({ estado, limite }) => {
        // Prepara la consulta a la tabla 'tareas_mcp', pidiendo solo id, titulo y estado, ordenados por id y limitando resultados
        let consulta = supabase.from('tareas_mcp')
            .select('id,titulo,estado').order('id').limit(limite);

        // Si el usuario proporcionó un 'estado', agrega un filtro WHERE estado = valor a la consulta
        if (estado) consulta = consulta.eq('estado', estado);

        // Ejecuta la consulta en Supabase y extrae los datos obtenidos o el posible error
        const { data, error } = await consulta;

        // Si ocurre un error en la base de datos, devuelve una respuesta marcada como error según el estándar MCP
        if (error) return {
            isError: true,
            content: [{ type: 'text', text: error.message }]
        };

        // Si todo salió bien, formatea los datos con la función auxiliar 'exito' y los retorna
        return exito(data);
    });

    // Espacio reservado para registrar más herramientas (por ejemplo: crear o actualizar tareas)
    // insertar aqui herramientas 2 y 3

    //nueva herramienta
// Registra una segunda herramienta llamada 'buscar_tareas' en el servidor MCP
    server.registerTool('buscar_tareas', {
        // Describe al modelo de IA la función de esta herramienta para que sepa cuándo invocarla
        description: 'Buscar tareas por texto dentro del titulo',
        // Define y valida los parámetros de entrada esperados usando Zod
        inputSchema: z.object({
            // 'texto' debe ser una cadena, elimina espacios al inicio/final (.trim()), y tener entre 2 y 60 caracteres
            texto: z.string().trim().min(2).max(60)
        })
    // Función asíncrona que se ejecuta cuando la IA llama a la herramienta, recibiendo el 'texto' ya limpio y validado
    }, async ({ texto }) => {
        // Consulta la tabla 'tareas_mcp' en Supabase de forma asíncrona
        const { data, error } = await supabase.from('tareas_mcp')
            // Selecciona únicamente las columnas id, titulo y estado
            .select('id,titulo,estado')
            // Busca coincidencias insensibles a mayúsculas/minúsculas (ILIKE) donde el título termine con 'texto'
            // Nota: si quieres buscar en cualquier parte del título, agrega otro % al final: `%${texto}%`
            .ilike('titulo', `%${texto}`)
            // Ordena los resultados por 'id' ascendente y limita la respuesta a un máximo de 20 registros
            .order('id').limit(20);

        // Si Supabase devuelve un error, retorna un objeto de error estandarizado para MCP
        if (error) return {
            isError: true,
            content: [{ type: 'text', text: error.message }]
        };

        // Si la búsqueda tiene éxito, formatea los resultados con la función 'exito' y los devuelve a la IA
        return exito(data);
    });
// Cierra la función crearServidor()

    server.registerTool('resumen_tareas',{
        description:'Cuantas tareas existen por estado',
        inputSchema: z.object({})
    },async()=>{
        const conteos=[]
        for(const estado of estados){
            const {count,error}=await supabase.from('tareas_mcp')
            .select('id',{count:'exact',head:true})
            .eq('estado',estado)

            if(error)return{
                isError:true,
                content:[{type:'text',text:error.message}]
            }

            conteos.push({estado,cantidad:count??0})
        }
        return exito(conteos)
    }
)

    // Devuelve la instancia del servidor ya configurada con sus herramientas
    return server;
}


serveStdio(crearServidor)
console.error('Servidor MCP iniciado (stdio)')