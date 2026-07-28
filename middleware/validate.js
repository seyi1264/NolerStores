const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');

const ajv = new Ajv({ allErrors: true, removeAdditional: false });
const schemasDir = path.join(__dirname, '..', 'schemas');

const compiled = {};

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
