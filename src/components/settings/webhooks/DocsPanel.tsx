export function DocsPanel() {
  return (
    <div className="space-y-4 text-sm text-foreground">
      <div className="border border-border rounded-lg p-4 bg-background">
        <h4 className="font-semibold mb-2">Headers enviados em cada requisição</h4>
        <pre className="bg-card p-3 rounded text-xs overflow-auto">{`Content-Type: application/json
User-Agent: CRM-Webhooks/2.0
X-Webhook-Event:           <event>
X-Webhook-Delivery:        <uuid único por tentativa>
X-Webhook-Correlation-Id:  <uuid estável por evento>
X-Webhook-Timestamp:       <unix>
X-Webhook-Signature:       t=<unix>,v1=<hmac_sha256_hex>
X-Webhook-Signature-256:   sha256=<hmac_sha256_hex>
X-Webhook-Attempt:         <n>`}</pre>
      </div>

      <div className="border border-border rounded-lg p-4 bg-background">
        <h4 className="font-semibold mb-2">Verificar assinatura no n8n (Function node)</h4>
        <pre className="bg-card p-3 rounded text-xs overflow-auto">{`const crypto = require('crypto');
const secret = 'SEU_SEGREDO';
const sigHeader = $headers['x-webhook-signature']; // "t=...,v1=..."
const ts = sigHeader.split(',')[0].split('=')[1];
const sig = sigHeader.split(',')[1].split('=')[1];

const body = JSON.stringify($json); // body bruto recebido
const expected = crypto.createHmac('sha256', secret).update(\`\${ts}.\${body}\`).digest('hex');

if (!crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(sig, 'hex'))) {
  throw new Error('Assinatura inválida');
}
return [{ json: $json }];`}</pre>
      </div>

      <div className="border border-border rounded-lg p-4 bg-background">
        <h4 className="font-semibold mb-2">Boas práticas</h4>
        <ul className="list-disc list-inside space-y-1 text-muted-foreground">
          <li>Use o <code>X-Webhook-Correlation-Id</code> como chave de idempotência.</li>
          <li>Responda HTTP 2xx em até 15s — caso contrário tentamos novamente com backoff exponencial (30s → 6h, até 6 tentativas).</li>
          <li>Erros 4xx (exceto 408 e 429) marcam a entrega como definitiva, sem retry.</li>
          <li>Após 6 falhas a entrega vira <strong>definitiva</strong> e os admins recebem alerta.</li>
        </ul>
      </div>

      <div className="border border-border rounded-lg p-4 bg-background">
        <h4 className="font-semibold mb-2">Estrutura do payload</h4>
        <pre className="bg-card p-3 rounded text-xs overflow-auto">{`{
  "id":              "<delivery_id>",
  "correlation_id":  "<uuid estável>",
  "event":           "lead.stage_changed",
  "occurred_at":     "2026-05-06T12:00:00.000Z",
  "company":         { "id": "...", "name": "..." },
  "data":            { /* objeto principal */ },
  "previous":        { /* mudanças, em updates */ },
  "context":         {
    "lead":         { /* lead completo, quando aplicável */ },
    "conversation": { /* conversa, em mensagens */ },
    "instance":     { /* instância WhatsApp */ }
  }
}`}</pre>
      </div>
    </div>
  );
}
