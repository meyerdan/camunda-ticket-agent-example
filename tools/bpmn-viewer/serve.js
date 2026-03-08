const express = require('express');
const fs = require('fs');
const path = require('path');

const bpmnFile = process.argv[2];
if (!bpmnFile) {
  console.error('Usage: node serve.js <path-to-bpmn-file>');
  process.exit(1);
}

const bpmnPath = path.resolve(bpmnFile);
if (!fs.existsSync(bpmnPath)) {
  console.error(`File not found: ${bpmnPath}`);
  process.exit(1);
}

const app = express();
const PORT = 3333;

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/bpmn', (req, res) => {
  res.type('application/xml').send(fs.readFileSync(bpmnPath, 'utf-8'));
});

app.listen(PORT, () => {
  console.log(`BPMN Viewer: http://localhost:${PORT}`);
  console.log(`Viewing: ${bpmnPath}`);
});
