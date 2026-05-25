require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);


const tools = [
  {
    name: "getExcursiiDupaData",
    description: "Citeste excursiile din JSON-Server filtrate dupa data de plecare (mai mari sau egale cu data data)",
    parameters: { data: "string (YYYY-MM-DD)" }
  },
  {
    name: "adaugaParticipant",
    description: "Adauga un participant nou la o excursie in JSON-Server",
    parameters: { excursieId: "number", nume: "string", email: "string", nr_persoane: "number" }
  },
  {
    name: "getExcursiiGraphQL",
    description: "Citeste excursiile din GraphQL-Server filtrate dupa tara",
    parameters: { tara: "string" }
  },
  {
    name: "adaugaExcursieGraphQL",
    description: "Adauga o excursie noua in GraphQL-Server",
    parameters: { destinatie: "string", tara: "string", data_plecare: "string", pret: "number" }
  },
  {
    name: "getParticipantiDinRDF",
    description: "Citeste participantii dintr-o excursie specifica din RDF4J",
    parameters: { destinatie: "string" }
  },
  {
    name: "adaugaExcursieRDF",
    description: "Adauga o excursie si un participant in RDF4J",
    parameters: { destinatie: "string", tara: "string", data_plecare: "string", pret: "number", numeParticipant: "string", emailParticipant: "string" }
  }
];


async function executeTool(toolName, params) {
  if (toolName === "getExcursiiDupaData") {
    const res = await axios.get(`http://localhost:4000/excursie`);
    return res.data.filter(e => e.data_plecare >= params.data);
  }

  if (toolName === "adaugaParticipant") {
    const res = await axios.post(`http://localhost:4000/participant`, {
      excursieId: Number(params.excursieId),
      nume: params.nume,
      email: params.email,
      nr_persoane: Number(params.nr_persoane)
    });
    return res.data;
  }

  if (toolName === "getExcursiiGraphQL") {
    const query = `{ allExcursies(filter: { tara: "${params.tara}" }) { id destinatie tara data_plecare pret } }`;
    const res = await axios.post(`http://localhost:3000/`, { query });
    return res.data.data.allExcursies;
}

  if (toolName === "adaugaExcursieGraphQL") {
    const mutation = `mutation { createExcursie(destinatie: "${params.destinatie}", tara: "${params.tara}", data_plecare: "${params.data_plecare}", pret: ${Number(params.pret)}) { id destinatie } }`;
    await axios.post(`http://localhost:3000/`, { query: mutation });
    const res = await axios.post(`http://localhost:4000/excursie`, {
      destinatie: params.destinatie,
      tara: params.tara,
      data_plecare: params.data_plecare,
      pret: Number(params.pret)
    });
    return res.data;
  }

  if (toolName === "getParticipantiDinRDF") {
    const sparql = `PREFIX ex: <http://excursii.org/> SELECT ?nume ?email WHERE { ?excursie a ex:Excursie . ?excursie ex:destinatie "${params.destinatie}" . ?participant a ex:Participant . ?participant ex:laExcursie ?excursie . ?participant ex:nume ?nume . ?participant ex:email ?email .}`;
    const res = await axios.get(`http://localhost:8080/rdf4j-server/repositories/grafexamen`, {
      params: { query: sparql },
      headers: { Accept: 'application/sparql-results+json' }
    });
    return res.data.results.bindings;
  }

  if (toolName === "adaugaExcursieRDF") {
    const excursieId = `ex:excursie_${Date.now()}`;
    const participantId = `ex:participant_${Date.now()}`;
    const sparql = `
      PREFIX ex: <http://excursii.org/>
      INSERT DATA {
        ${excursieId} a ex:Excursie ;
          ex:destinatie "${params.destinatie}" ;
          ex:tara "${params.tara}" ;
          ex:dataPlecare "${params.data_plecare}" ;
          ex:pret ${params.pret} .
        ${participantId} a ex:Participant ;
          ex:nume "${params.numeParticipant}" ;
          ex:email "${params.emailParticipant}" ;
          ex:laExcursie ${excursieId} .
      }
    `;
    await axios.post(
      `http://localhost:8080/rdf4j-server/repositories/grafexamen/statements`,
      sparql,
      { headers: { 'Content-Type': 'application/sparql-update' } }
    );
    return { success: true, message: "Date adaugate in RDF4J" };
  }

  return { error: "Tool necunoscut" };
}


app.post('/chat', async (req, res) => {
  const { message } = req.body;

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const toolsDescription = tools.map(t =>
      `- ${t.name}: ${t.description}. Parametri: ${JSON.stringify(t.parameters)}`
    ).join('\n');

    const prompt = `Esti un asistent pentru o baza de date de excursii. Ai DOAR aceste operatii disponibile:
${toolsDescription}

Userul a spus: "${message}"

REGULI STRICTE:
1. Daca userul mentioneaza o tara, destinatie, data sau vrea sa vada excursii/participanti -> foloseste tool-ul potrivit
2. Daca userul vrea sa adauge ceva -> foloseste tool-ul de scriere potrivit
3. Nu raspunde niciodata din propria cunostinta despre excursii
4. "excursiile din Italia" = getExcursiiGraphQL cu tara="Italia"
5. "excursiile dupa data" = getExcursiiDupaData cu data respectiva

Raspunde DOAR cu JSON, fara alte cuvinte:
{"tool": "numeTool", "params": {...}}
Sau daca e o intrebare generala fara legatura cu datele:
{"tool": null, "answer": "raspunsul tau"}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(text);

    if (parsed.tool) {
      const toolResult = await executeTool(parsed.tool, parsed.params);

      const prompt2 = `Datele obtinute sunt: ${JSON.stringify(toolResult)}
Formuleaza un raspuns natural si clar in romana pentru userul care a intrebat: "${message}"`;

      const result2 = await model.generateContent(prompt2);
      return res.json({ 
        answer: result2.response.text(),
        data: toolResult
      });
    } 

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(5000, () => console.log('Proxy MCP pornit pe port 5000'));