const { query, run, getOne } = require('../db');
const { shapeCampaign } = require('../middleware/response');

async function listCampaigns({ q } = {}) {
  const where = q ? `WHERE (LOWER(name) LIKE LOWER('%' || $1 || '%') OR LOWER(description) LIKE LOWER('%' || $1 || '%') OR LOWER(cta_url) LIKE LOWER('%' || $1 || '%'))` : '';
  const params = q ? [q] : [];
  const rows = await query(`SELECT id, name, description, status, starts_at, ends_at, image_url, cta_url, created_at FROM campaigns ${where} ORDER BY created_at DESC`, params);
  return (rows || []).map(shapeCampaign);
}

async function getCampaignById(id) {
  const row = await getOne(`SELECT id, name, description, status, starts_at, ends_at, image_url, cta_url, created_at FROM campaigns WHERE id = $1`, [id]);
  return shapeCampaign(row);
}

async function createCampaign({ id, name, description, status, starts_at, ends_at, image_url, cta_url }) {
  const campaignId = id || require('uuid').v4();
  await run(`INSERT INTO campaigns (id, name, description, status, starts_at, ends_at, image_url, cta_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [
    campaignId,
    name.trim(),
    description || null,
    status || 'draft',
    starts_at || null,
    ends_at || null,
    image_url || null,
    cta_url || null,
  ]);
  return await getCampaignById(campaignId);
}

async function updateCampaign(campaignId, { name, description, status, starts_at, ends_at, image_url, cta_url }) {
  await run(`UPDATE campaigns SET name = $1, description = $2, status = $3, starts_at = $4, ends_at = $5, image_url = $6, cta_url = $7 WHERE id = $8`, [
    name.trim(),
    description || null,
    status || 'draft',
    starts_at || null,
    ends_at || null,
    image_url || null,
    cta_url || null,
    campaignId,
  ]);
  return await getCampaignById(campaignId);
}

async function deleteCampaign(campaignId) {
  await run(`DELETE FROM campaigns WHERE id = $1`, [campaignId]);
  return true;
}

async function bulkUpdateStatus(campaignIds, status) {
  if (!Array.isArray(campaignIds) || !campaignIds.length) return 0;
  const placeholders = campaignIds.map((_, idx) => `$${idx + 1}`).join(', ');
  await run(`UPDATE campaigns SET status = $${campaignIds.length + 1} WHERE id IN (${placeholders})`, [...campaignIds, status]);
  return campaignIds.length;
}

async function listCampaignActions({ q, limit = 100 } = {}) {
  const where = q ? `WHERE (LOWER(action) LIKE LOWER('%' || $1 || '%') OR LOWER(reason) LIKE LOWER('%' || $1 || '%') OR LOWER(metadata) LIKE LOWER('%' || $1 || '%'))` : '';
  const params = q ? [q, limit] : [limit];
  const actions = await query(`SELECT id, campaign_id, action, actor, actor_ip, reason, metadata, created_at FROM campaign_actions ${where} ORDER BY created_at DESC LIMIT $${params.length}`, params);
  // Parse metadata JSON where present
  return (actions || []).map((a) => {
    try {
      if (a.metadata && typeof a.metadata === 'string') a.metadata = JSON.parse(a.metadata);
    } catch (e) {
      // leave as-is
    }
    return a;
  });
}

module.exports = {
  listCampaigns,
  getCampaignById,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  bulkUpdateStatus,
  listCampaignActions,
};
