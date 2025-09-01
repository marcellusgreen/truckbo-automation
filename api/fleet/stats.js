const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false
  } : false
});

const getOrganizationId = () => {
  // TODO: Replace with actual authentication/authorization to get the user's organization ID
  return '550e8400-e29b-41d4-a716-446655440000';
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

  const organizationId = getOrganizationId();

  try {
    const statsQuery = `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
        COUNT(CASE WHEN status = 'inactive' THEN 1 END) as inactive,
        COUNT(CASE WHEN created_at > CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as recently_added
      FROM vehicles 
      WHERE organization_id = $1
    `;
    
    const result = await pool.query(statsQuery, [organizationId]);
    const stats = result.rows[0];
    
    const fleetStats = {
      total: parseInt(stats.total),
      active: parseInt(stats.active),
      inactive: parseInt(stats.inactive),
      recentlyAdded: parseInt(stats.recently_added)
    };
    
    res.status(200).json(fleetStats);
  } catch (error) {
    console.error('Error getting fleet stats from PostgreSQL:', error);
    res.status(500).json({ 
      error: 'Failed to get fleet statistics',
      stats: { total: 0, active: 0, inactive: 0, recentlyAdded: 0 }
    });
  }
}