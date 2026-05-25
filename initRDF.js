const axios = require("axios");

const sparql = `
  PREFIX ex: <http://excursii.org/>
  INSERT DATA {
  ex:excursie_1 a ex:Excursie ; ex:destinatie "Paris" ; ex:tara "Franta" ; ex:dataPlecare "2026-06-10" ; ex:pret 1200 .
  ex:excursie_2 a ex:Excursie ; ex:destinatie "Roma" ; ex:tara "Italia" ; ex:dataPlecare "2026-07-15" ; ex:pret 950 .
  ex:excursie_3 a ex:Excursie ; ex:destinatie "Barcelona" ; ex:tara "Spania" ; ex:dataPlecare "2026-08-01" ; ex:pret 1100 .
  ex:participant_1 a ex:Participant ; ex:nume "Ion Popescu" ; ex:email "ion@mail.com" ; ex:laExcursie ex:excursie_1 .
  ex:participant_2 a ex:Participant ; ex:nume "Ana Ionescu" ; ex:email "ana@mail.com" ; ex:laExcursie ex:excursie_1 .
  ex:participant_3 a ex:Participant ; ex:nume "Maria Popa" ; ex:email "maria@mail.com" ; ex:laExcursie ex:excursie_2 .
  ex:participant_4 a ex:Participant ; ex:nume "Andrei Stan" ; ex:email "andrei@mail.com" ; ex:laExcursie ex:excursie_3 .
}
`;

axios.post(
    `http://localhost:8080/rdf4j-server/repositories/grafexamen/statements`,
    sparql,
    { headers: { 'Content-Type': 'application/sparql-update' } }
)
.then(() => console.log("RDF data initialized"))
.catch(err => console.error("Error initializing RDF data:", err));