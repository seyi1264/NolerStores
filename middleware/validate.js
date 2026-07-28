const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');

const ajv = new Ajv({ allErrors: true, removeAdditional: false });
// Add lightweight date-time and date format validators without extra deps
ajv.addFormat('date-time', {
  validate: (d) => {
    if (typeof d !== 'string') return false;
    const t = Date.parse(d);
    return !Number.isNaN(t);
  },
});
ajv.addFormat('date', {
  validate: (d) => {
    if (typeof d !== 'string') return false;
    // Accept YYYY-MM-DD or other parsable strings
    const t = Date.parse(d);
    return !Number.isNaN(t);
  },
});
const schemasDir = path.join(__dirname, '..', 'schemas');

const compiled = {};

// Per-schema coercion opt-in. Only fields listed here will be coerced.
// Keys are schema filenames without extension (e.g. 'product-create').
const COERCION_MAP = {
  'product-create': { price: 'number', stock: 'integer' },
  'product-update': { price: 'number', stock: 'integer', active: 'boolean' },
  'campaign-create': { starts_at: 'date-time', ends_at: 'date-time' },
  'campaign-update': { starts_at: 'date-time', ends_at: 'date-time' },
};

function loadSchema(name) {
  if (compiled[name]) return compiled[name];
  const file = path.join(schemasDir, `${name}.schema.json`);
  if (!fs.existsSync(file)) throw new Error(`Schema not found: ${name}`);
  const raw = fs.readFileSync(file, 'utf8');
  const schema = JSON.parse(raw);
  const validate = ajv.compile(schema);
  compiled[name] = validate;
  return validate;
}

function validateBody(schemaName) {
  return (req, res, next) => {
    try {
      // Load the raw schema file so we can map incoming camelCase keys to
      // the schema's expected property names (commonly snake_case). This
      // lets clients post camelCase while the DB and schema remain snake_case.
      const schemaFile = path.join(schemasDir, `${schemaName}.schema.json`);
      const schemaRaw = fs.readFileSync(schemaFile, 'utf8');
      const schema = JSON.parse(schemaRaw);

      // Map incoming keys to schema property names. We'll only include keys
      // that the schema declares (to satisfy additionalProperties=false).
      const body = req.body || {};
      const originalBody = JSON.parse(JSON.stringify(body));
      const mapped = {};
      const props = schema.properties || {};
      const toSnake = (s) => s.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
      Object.keys(body).forEach((k) => {
        if (Object.prototype.hasOwnProperty.call(props, k)) {
          mapped[k] = body[k];
          return;
        }
        const snake = toSnake(k);
        if (Object.prototype.hasOwnProperty.call(props, snake)) {
          mapped[snake] = body[k];
          return;
        }
        // If the schema doesn't know this property, skip it — the validator
        // will enforce required fields and reject unknown properties.
      });

      // Coerce only for fields explicitly enabled in COERCION_MAP.
      // Respect environment flag to enable/disable coercion (default enabled)
      const coercionEnabled = (process.env.COERCION_ENABLED || 'true') === 'true';
      const coercionRules = coercionEnabled ? (COERCION_MAP[schemaName] || {}) : {};
      const coerced = [];
      Object.keys(props).forEach((prop) => {
        const schemaProp = props[prop] || {};
        const types = Array.isArray(schemaProp.type) ? schemaProp.type : (schemaProp.type ? [schemaProp.type] : []);
        if (mapped[prop] === undefined || mapped[prop] === null) return;
        const rule = coercionRules[prop];
        if (!rule) return; // not opted-in for coercion

        // Number coercion: "24,500" -> 24500
        if (types.includes('number')) {
          if (typeof mapped[prop] === 'string') {
            const cleaned = mapped[prop].replace(/[,\s]/g, '');
            const n = Number(cleaned);
            if (Number.isFinite(n)) mapped[prop] = n;
          }
        }

        // Integer coercion
        if (types.includes('integer')) {
          if (typeof mapped[prop] === 'string') {
            const cleaned = mapped[prop].replace(/[,\s]/g, '');
            const i = parseInt(cleaned, 10);
            if (!Number.isNaN(i)) mapped[prop] = i;
          }
        }

        // Boolean coercion: 'true'/'false'/'1'/'0'
        if (types.includes('boolean')) {
          if (typeof mapped[prop] === 'string') {
            const v = mapped[prop].toLowerCase().trim();
            if (v === 'true' || v === '1') mapped[prop] = true;
            else if (v === 'false' || v === '0') mapped[prop] = false;
          }
        }

        // Date coercion: schema format 'date-time' -> ISO string
        if ((schemaProp.format === 'date-time' || schemaProp.format === 'date') && (rule === 'date-time' || rule === 'date')) {
          if (typeof mapped[prop] === 'string' || typeof mapped[prop] === 'number') {
            const parsed = new Date(mapped[prop]);
            if (!Number.isNaN(parsed.getTime())) {
              // Keep only ISO string (UTC) for canonical storage
              const before = mapped[prop];
              mapped[prop] = parsed.toISOString();
              coerced.push({ field: prop, before, after: mapped[prop] });
            }
          }
        }
        // For other coercions, capture coerced values
        if (types.includes('number') && rule === 'number') {
          if (typeof mapped[prop] === 'string') {
            const before = mapped[prop];
            const cleaned = mapped[prop].replace(/[,\s]/g, '');
            const n = Number(cleaned);
            if (Number.isFinite(n)) {
              mapped[prop] = n;
              coerced.push({ field: prop, before, after: mapped[prop] });
            }
          }
        }
        if (types.includes('integer') && rule === 'integer') {
          if (typeof mapped[prop] === 'string') {
            const before = mapped[prop];
            const cleaned = mapped[prop].replace(/[,\s]/g, '');
            const i = parseInt(cleaned, 10);
            if (!Number.isNaN(i)) {
              mapped[prop] = i;
              coerced.push({ field: prop, before, after: mapped[prop] });
            }
          }
        }
        if (types.includes('boolean') && rule === 'boolean') {
          if (typeof mapped[prop] === 'string') {
            const before = mapped[prop];
            const v = mapped[prop].toLowerCase().trim();
            if (v === 'true' || v === '1') { mapped[prop] = true; coerced.push({ field: prop, before, after: true }); }
            else if (v === 'false' || v === '0') { mapped[prop] = false; coerced.push({ field: prop, before, after: false }); }
          }
        }
      });

      // Replace the request body with the normalized one used for validation
      // and downstream handlers. Attach coercion info and write debug log.
      req.body = mapped;
      if (coerced.length) {
        req._coercion = coerced;
        try {
          const logDir = path.join(__dirname, '..', 'logs');
          if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
          const logPath = path.join(logDir, 'coercion.log');

          // Redact sensitive fields before logging
          function redact(obj) {
            if (!obj || typeof obj !== 'object') return obj;
            const out = Array.isArray(obj) ? [] : {};
            const redactKeys = [/password/i, /token/i, /account_number/i, /accountNumber/i, /accountname/i, /account_name/i, /bank/i, /email/i, /payment_reference/i, /paymentReference/i];
            for (const k of Object.keys(obj)) {
              try {
                const v = obj[k];
                if (v === null || v === undefined) { out[k] = v; continue; }
                if (typeof v === 'object') { out[k] = redact(v); continue; }
                const keyName = String(k);
                if (redactKeys.some(rx => rx.test(keyName))) {
                  const s = String(v);
                  out[k] = s.length > 6 ? `${s.slice(0,3)}...${s.slice(-3)}` : 'REDACTED';
                } else {
                  out[k] = v;
                }
              } catch (e) { out[k] = '[redaction-error]'; }
            }
            return out;
          }

          const entry = { ts: new Date().toISOString(), path: req.path, schema: schemaName, ip: req.ip || null, actor: (req.admin && req.admin.username) || (req.sellerId || null), original: redact(originalBody), mapped: redact(mapped), coerced };

          // Simple log rotation: rotate when >5MB
          try {
            if (fs.existsSync(logPath)) {
              const stats = fs.statSync(logPath);
              const max = Number(process.env.COERCION_LOG_MAX_BYTES || 5 * 1024 * 1024);
              if (stats.size > max) {
                const rot = logPath + '.1';
                try { fs.unlinkSync(rot); } catch (e) {}
                fs.renameSync(logPath, rot);
              }
            }
            fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
          } catch (e) {
            console.error('Failed to rotate/append coercion log', e);
          }
        } catch (err) {
          console.error('Failed to write coercion log', err);
        }
      }

      const validate = loadSchema(schemaName);
      const valid = validate(req.body || {});
      if (!valid) {
        return res.status(400).json({ error: 'Invalid request body', details: validate.errors });
      }
      next();
    } catch (err) {
      console.error('Validation middleware error', err);
      return res.status(500).json({ error: 'Server validation error' });
    }
  };
}

module.exports = { validateBody };
