const db = require('../db');

(async function(){
  try{
    const rows = await db.query('SELECT id, name, status, starts_at, ends_at, image_url, created_at FROM campaigns ORDER BY created_at DESC');
    console.log('Campaign rows:', rows.length);
    console.log(rows);
    await db.close();
  } catch(err){
    console.error('Error', err);
    process.exit(1);
  }
})();
