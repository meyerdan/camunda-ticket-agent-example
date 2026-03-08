// Helper for uploading/downloading JSON documents via the Camunda 8 Document Store API.
// Keeps large payloads out of process variables by storing them as documents
// and passing only a lightweight reference through the engine.
//
// C8 Run default: in-memory store (data lost on restart — fine for dev).
// Production: configure AWS S3 / GCP storage via environment variables.

const CAMUNDA_REST = process.env.ZEEBE_REST_ADDRESS || 'http://localhost:8080/v2';
const DOCUMENTS_URL = `${CAMUNDA_REST.replace(/\/v2\/?$/, '')}/v2/documents`;

/**
 * Upload a JSON payload as a document and return a Camunda document reference.
 *
 * @param {any}    data     - JSON-serializable data to store
 * @param {string} fileName - Logical file name (e.g. "concert-results.json")
 * @returns {Promise<object>} Document reference (documentId, contentHash, metadata, …)
 */
export async function uploadDocument(data, fileName) {
  const json = JSON.stringify(data);
  const blob = new Blob([json], { type: 'application/json' });

  const form = new FormData();
  form.append('file', blob, fileName);
  form.append(
    'metadata',
    new Blob([JSON.stringify({ fileName, contentType: 'application/json' })], {
      type: 'application/json',
    })
  );

  const response = await fetch(DOCUMENTS_URL, { method: 'POST', body: form });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Document upload failed (${response.status}): ${body}`);
  }

  const ref = await response.json();
  console.log(`[document-store] Uploaded ${fileName} → ${ref.documentId} (${json.length} bytes)`);
  return ref;
}

/**
 * Download a document by its reference and parse as JSON.
 *
 * @param {object} docRef - Camunda document reference (must have documentId + contentHash)
 * @returns {Promise<any>} Parsed JSON content
 */
export async function downloadDocument(docRef) {
  if (!docRef?.documentId || !docRef?.contentHash) {
    throw new Error('Invalid document reference — missing documentId or contentHash');
  }

  const url = `${DOCUMENTS_URL}/${docRef.documentId}?contentHash=${docRef.contentHash}`;
  const response = await fetch(url);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Document download failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  console.log(`[document-store] Downloaded ${docRef.documentId}`);
  return data;
}
