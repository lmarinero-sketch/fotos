// Setup RLS policies for events table
// Usage: node setup-rls.mjs

const MGMT_TOKEN = 'sbp_f9d0cfe09cc1fc2fd9fdacfea8f6a987b6644977'
const PROJECT_REF = 'pxvhovctyewwppwkldaq'

async function runSQL(label, sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MGMT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  })
  const text = await res.text()
  console.log(`${res.ok ? '✅' : '❌'} ${label}`, text.substring(0, 100))
}

async function main() {
  console.log('🔧 Setting up RLS policies...\n')

  // Enable RLS
  await runSQL('Enable RLS on events', 'ALTER TABLE events ENABLE ROW LEVEL SECURITY;')
  await runSQL('Enable RLS on orders', 'ALTER TABLE orders ENABLE ROW LEVEL SECURITY;')
  await runSQL('Enable RLS on order_photos', 'ALTER TABLE order_photos ENABLE ROW LEVEL SECURITY;')

  // Events: authenticated users can CRUD their own events
  await runSQL('Drop old policies', `
    DROP POLICY IF EXISTS events_select ON events;
    DROP POLICY IF EXISTS events_insert ON events;
    DROP POLICY IF EXISTS events_update ON events;
    DROP POLICY IF EXISTS events_delete ON events;
  `)

  await runSQL('Events SELECT', `
    CREATE POLICY events_select ON events FOR SELECT
    USING (auth.uid() = photographer_id);
  `)

  await runSQL('Events INSERT', `
    CREATE POLICY events_insert ON events FOR INSERT
    WITH CHECK (auth.uid() = photographer_id);
  `)

  await runSQL('Events UPDATE', `
    CREATE POLICY events_update ON events FOR UPDATE
    USING (auth.uid() = photographer_id);
  `)

  await runSQL('Events DELETE', `
    CREATE POLICY events_delete ON events FOR DELETE
    USING (auth.uid() = photographer_id);
  `)

  // Orders: service_role handles most, but public can read approved
  await runSQL('Drop old order policies', `
    DROP POLICY IF EXISTS orders_public_read ON orders;
  `)

  await runSQL('Orders public read', `
    CREATE POLICY orders_public_read ON orders FOR SELECT
    USING (status IN ('approved', 'sending', 'delivered'));
  `)

  // Order photos: public can read photos of approved orders
  await runSQL('Drop old photo policies', `
    DROP POLICY IF EXISTS photos_public_read ON order_photos;
  `)

  await runSQL('Photos public read', `
    CREATE POLICY photos_public_read ON order_photos FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM orders
        WHERE orders.id = order_photos.order_id
        AND orders.status IN ('approved', 'sending', 'delivered')
      )
    );
  `)

  console.log('\n✅ RLS setup complete!')
}

main().catch(console.error)
