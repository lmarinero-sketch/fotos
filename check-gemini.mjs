import 'dotenv/config';

async function listModels() {
  const apiKey = process.env.VITE_GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    console.log("Modelos disponibles:", data.models?.map(m => m.name).filter(m => m.includes('gemini')));
  } catch(e) {
    console.error("Error:", e);
  }
}

listModels();
