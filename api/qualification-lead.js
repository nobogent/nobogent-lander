// Vercel Serverless Function to process Meta Ads Qualification Form submissions
// and route them directly to Nobogent Super Admin (rchopra489@gmail.com) in Supabase CRM

const DEFAULT_SUPABASE_URL = 'https://hpssqssdewmkmafxlfud.supabase.co';
const DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhwc3Nxc3NkZXdta21hZnhsZnVkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjgxMTkyMSwiZXhwIjoyMDk4Mzg3OTIxfQ.HgzsU10Lft2bpkOe5SMx-MyW_kmx0ld7txyqe8grlAA';
const SUPER_ADMIN_USER_ID = 'bc63c065-9bcc-4793-bedc-f0960406425b'; // rchopra489@gmail.com

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const {
      name,
      phone,
      email,
      business_type,
      marketing_spend,
      leads_per_month,
      responsible_role,
      primary_goals,
      current_crm,
      city,
      ad_account_id = '1532845147843203',
      pixel_id = '1684055349552829',
      source = 'Pricing India Meta Ad'
    } = body;

    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and phone number are required.' });
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || DEFAULT_SUPABASE_KEY;

    const cleanDigits = (phone || '').replace(/\D/g, '');
    const cleanPhone = cleanDigits.startsWith('91') && cleanDigits.length === 12
      ? `+${cleanDigits}`
      : cleanDigits.length === 10
        ? `+91${cleanDigits}`
        : phone;

    const formattedGoals = Array.isArray(primary_goals) ? primary_goals.join(', ') : (primary_goals || 'Not specified');

    const notesSummary = [
      '=== META ADS QUALIFICATION QUESTIONNAIRE ===',
      `1. Business Type: ${business_type || 'N/A'}`,
      `2. Monthly Marketing Spend: ${marketing_spend || 'N/A'} (Biggest Qualifier)`,
      `3. Monthly Leads: ${leads_per_month || 'N/A'}`,
      `4. Implementation Lead: ${responsible_role || 'N/A'}`,
      `5. Primary Goals: ${formattedGoals}`,
      `6. Current CRM/Automation: ${current_crm || 'None'}`,
      `Location / City: ${city || 'N/A'}`,
      `Ad Account ID: ${ad_account_id}`,
      `Pixel ID: ${pixel_id}`,
      `Submitted: ${new Date().toISOString()}`,
      `Page: /pricing-india`
    ].join('\n');

    const customFields = {
      business_type: business_type || '',
      marketing_spend: marketing_spend || '',
      leads_per_month: leads_per_month || '',
      responsible_role: responsible_role || '',
      primary_goals: formattedGoals,
      current_crm: current_crm || '',
      city: city || '',
      ad_account_id,
      pixel_id,
      source_page: '/pricing-india',
      submitted_at: new Date().toISOString()
    };

    // Check if lead already exists by phone to update or reopen
    const searchDigits = cleanDigits.slice(-10);
    let existingLead = null;

    if (searchDigits.length >= 7) {
      const checkRes = await fetch(
        `${supabaseUrl}/rest/v1/leads?user_id=eq.${SUPER_ADMIN_USER_ID}&phone=like.*${searchDigits}&select=id,name,phone,custom_fields&limit=1`,
        {
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`
          }
        }
      );
      if (checkRes.ok) {
        const matches = await checkRes.json();
        if (matches && matches.length > 0) {
          existingLead = matches[0];
        }
      }
    }

    let leadId = '';

    if (existingLead) {
      leadId = existingLead.id;
      let cf = existingLead.custom_fields || {};
      if (typeof cf === 'string') {
        try { cf = JSON.parse(cf); } catch (e) { cf = {}; }
      }
      cf = { ...cf, ...customFields, last_reopened_at: new Date().toISOString() };

      const updateRes = await fetch(
        `${supabaseUrl}/rest/v1/leads?id=eq.${leadId}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify({
            name: name || existingLead.name,
            email: email || existingLead.email,
            phone: cleanPhone,
            budget: marketing_spend || null,
            custom_fields: cf,
            notes: notesSummary,
            pipeline_stage: 'New Lead',
            status: 'New Lead',
            calling_enabled: true,
            whatsapp_enabled: true,
            autonomous_status: 'NEW'
          })
        }
      );

      if (!updateRes.ok) {
        const errText = await updateRes.text();
        console.error('[API] Update lead error:', errText);
      }
    } else {
      const insertRes = await fetch(
        `${supabaseUrl}/rest/v1/leads`,
        {
          method: 'POST',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify({
            user_id: SUPER_ADMIN_USER_ID,
            name,
            phone: cleanPhone,
            email: email || null,
            budget: marketing_spend || null,
            source,
            ad_name: 'pricing-india-meta-ad',
            pipeline_stage: 'New Lead',
            status: 'New Lead',
            calling_enabled: true,
            whatsapp_enabled: true,
            autonomous_status: 'NEW',
            pixel_id,
            notes: notesSummary,
            custom_fields: customFields
          })
        }
      );

      if (!insertRes.ok) {
        const errText = await insertRes.text();
        console.error('[API] Insert lead error:', errText);
        return res.status(500).json({ error: 'Failed to record lead in CRM: ' + errText });
      }

      const created = await insertRes.json();
      leadId = created && created[0] ? created[0].id : '';
    }

    // Insert history timeline record
    if (leadId) {
      await fetch(
        `${supabaseUrl}/rest/v1/lead_history`,
        {
          method: 'POST',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            lead_id: leadId,
            action_type: existingLead ? 'REOPENED' : 'CREATED',
            performed_by: 'Pricing India Meta Ads Qualification Form',
            actor_name: 'Meta Ads Funnel',
            description: `Lead qualified via Pricing India Meta Ads:\n${notesSummary}`,
            details: customFields,
            created_at: new Date().toISOString()
          })
        }
      ).catch(e => console.warn('[API] History record error:', e));
    }

    return res.status(200).json({
      success: true,
      lead_id: leadId,
      message: 'Lead sent to Nobogent Super Admin CRM (rchopra489@gmail.com)'
    });
  } catch (err) {
    console.error('[API] Unexpected handler error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
