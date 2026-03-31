const PROJECT_REF = 'pxvhovctyewwppwkldaq';
const MGMT_TOKEN = 'sbp_f9d0cfe09cc1fc2fd9fdacfea8f6a987b6644977';

async function main() {
  const q = `SELECT tablename, policyname, roles, cmd, qual, with_check FROM pg_policies WHERE tablename IN ('orders', 'order_photos');`;
  
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${MGMT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q })
  });
  
  const text = await res.text();
  console.log(text);
}

main();
