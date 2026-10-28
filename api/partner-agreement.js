import nodemailer from 'nodemailer';

const DEFAULT_SUPABASE_URL = 'https://hpssqssdewmkmafxlfud.supabase.co';
const DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhwc3Nxc3NkZXdta21hZnhsZnVkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjgxMTkyMSwiZXhwIjoyMDk4Mzg3OTIxfQ.HgzsU10Lft2bpkOe5SMx-MyW_kmx0ld7txyqe8grlAA';
const SUPER_ADMIN_USER_ID = 'bc63c065-9bcc-4793-bedc-f0960406425b'; // rchopra489@gmail.com

const SMTP_CONFIG = {
  host: process.env.SMTP_HOST || 'smtp.hostinger.com',
  port: parseInt(process.env.SMTP_PORT || '465', 10),
  secure: (process.env.SMTP_SECURE === 'true') || true,
  auth: {
    user: process.env.SMTP_USER || 'info@nobogent.com',
    pass: process.env.SMTP_PASS || 'Manu@687399'
  }
};

function getTransporter() {
  return nodemailer.createTransport(SMTP_CONFIG);
}

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
      partner_name,
      email,
      phone,
      city,
      start_date,
      reporting_manager = 'Nobogent Partnerships Team',
      package_name = 'Nobogent Real Estate Growth Suite',
      subscription_price = 'Custom / Standard Tier',
      new_customer_commission = 'Standard Sales Partner Tier',
      recurring_commission = 'Active Monthly Retention Slab',
      experience = '',
      notes: partnerNotes = '',
      agreed_terms = {},
      acknowledged_at = new Date().toISOString()
    } = body;

    // Validation
    if (!partner_name || !email || !phone) {
      return res.status(400).json({ error: 'Full Name, Email, and Phone number are required.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Please provide a valid email address.' });
    }

    const cleanDigits = (phone || '').replace(/\D/g, '');
    const cleanPhone = cleanDigits.startsWith('91') && cleanDigits.length === 12
      ? `+${cleanDigits}`
      : cleanDigits.length === 10
        ? `+91${cleanDigits}`
        : phone;

    const formattedSignedDate = new Date(acknowledged_at).toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const supabaseUrl = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || DEFAULT_SUPABASE_KEY;

    // 1. Record lead / partner in Supabase CRM
    const notesSummary = [
      '=== NOBOGENT SALES PARTNER AGREEMENT SUBMISSION ===',
      `Company: NOBOGENT AI SOLUTIONS LLP`,
      `Program: Sales Partner Program`,
      `Partner Name: ${partner_name}`,
      `Email: ${email}`,
      `Phone: ${cleanPhone}`,
      `Location / City: ${city || 'Not specified'}`,
      `Proposed Start Date: ${start_date || 'Immediate'}`,
      `Reporting Manager: ${reporting_manager}`,
      `Experience: ${experience || 'N/A'}`,
      `Package / Scope: ${package_name}`,
      `Customer Subscription: ${subscription_price}`,
      `New Customer Commission: ${new_customer_commission}`,
      `Recurring Commission: ${recurring_commission}`,
      `Execution Date: ${formattedSignedDate} (${acknowledged_at})`,
      `Partner Note: ${partnerNotes || 'None'}`,
      `Document Acknowledgment: Accepted all policy documents & clauses via verified checkboxes (Offer Letter, Commission Performance Plan, CRM Policy, 30-Day Plan, Partner Acknowledgment)`
    ].join('\n');

    const customFields = {
      is_sales_partner: true,
      partner_name,
      city: city || '',
      start_date: start_date || '',
      reporting_manager,
      package_name,
      subscription_price,
      new_customer_commission,
      recurring_commission,
      acknowledged_at,
      agreed_terms,
      experience: experience || '',
      submitted_at: new Date().toISOString()
    };

    let leadId = '';
    try {
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

      if (existingLead) {
        leadId = existingLead.id;
        let cf = existingLead.custom_fields || {};
        if (typeof cf === 'string') {
          try { cf = JSON.parse(cf); } catch (e) { cf = {}; }
        }
        cf = { ...cf, ...customFields, last_partner_submitted_at: new Date().toISOString() };

        await fetch(
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
              name: partner_name,
              email: email,
              phone: cleanPhone,
              custom_fields: cf,
              notes: notesSummary,
              pipeline_stage: 'Sales Partner',
              status: 'Partner Onboarding',
              source: 'Sales Partner Agreement'
            })
          }
        );
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
              name: partner_name,
              phone: cleanPhone,
              email: email,
              source: 'Sales Partner Agreement',
              pipeline_stage: 'Sales Partner',
              status: 'Partner Onboarding',
              notes: notesSummary,
              custom_fields: customFields,
              created_at: new Date().toISOString()
            })
          }
        );
        if (insertRes.ok) {
          const created = await insertRes.json();
          leadId = created && created[0] ? created[0].id : '';
        }
      }

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
              action_type: 'PARTNER_AGREEMENT_SIGNED',
              performed_by: 'Sales Partner Portal',
              actor_name: partner_name,
              description: `Signed Nobogent Sales Partner Agreement:\n${notesSummary}`,
              details: customFields,
              created_at: new Date().toISOString()
            })
          }
        ).catch(e => console.warn('[Partner API] History log error:', e));
      }
    } catch (dbErr) {
      console.error('[Partner API] Database save warning:', dbErr);
    }

    // 2. Dispatch Confirmation Emails via Hostinger SMTP
    const transporter = getTransporter();

    // A. Partner Confirmation Email (Branded, full copy of agreement terms)
    const partnerEmailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nobogent Sales Partner Agreement Confirmation</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.6;">
  <div style="max-width: 680px; margin: 30px auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06);">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #090d16 0%, #17223b 100%); padding: 32px 36px; text-align: left; border-bottom: 2px solid #2563eb;">
      <div style="display: inline-block; padding: 6px 14px; background: rgba(37,99,235,0.25); border: 1px solid rgba(59,130,246,0.4); border-radius: 999px; color: #93c5fd; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px;">
        Official Onboarding Pack & Agreement
      </div>
      <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700; letter-spacing: -0.02em;">
        NOBOGENT AI SOLUTIONS LLP
      </h1>
      <p style="margin: 6px 0 0 0; color: #94a3b8; font-size: 14px;">
        Sales Partner Program • Execution Copy
      </p>
    </div>

    <!-- Main Content -->
    <div style="padding: 32px 36px;">
      
      <!-- Greeting Card -->
      <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin-bottom: 28px;">
        <h2 style="margin: 0 0 8px 0; color: #166534; font-size: 18px; font-weight: 700;">
          Welcome to the Team, ${partner_name}!
        </h2>
        <p style="margin: 0; color: #15803d; font-size: 14px; line-height: 1.5;">
          Thank you for completing your <strong>Sales Partner Onboarding Pack & Agreement</strong>. This document serves as your official record of agreement and acknowledgment with <strong>NOBOGENT AI SOLUTIONS LLP</strong>.
        </p>
      </div>

      <!-- Partner Record Overview -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 28px; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 14px;">
        <tbody>
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 12px 16px; font-weight: 600; color: #64748b; width: 38%;">Partner Name:</td>
            <td style="padding: 12px 16px; color: #0f172a; font-weight: 700;">${partner_name}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 12px 16px; font-weight: 600; color: #64748b;">Registered Email:</td>
            <td style="padding: 12px 16px; color: #0f172a;">${email}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 12px 16px; font-weight: 600; color: #64748b;">Phone / WhatsApp:</td>
            <td style="padding: 12px 16px; color: #0f172a;">${cleanPhone}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 12px 16px; font-weight: 600; color: #64748b;">City / Territory:</td>
            <td style="padding: 12px 16px; color: #0f172a;">${city || 'India'}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 12px 16px; font-weight: 600; color: #64748b;">Effective Start Date:</td>
            <td style="padding: 12px 16px; color: #0f172a;">${start_date || 'Upon onboarding'}</td>
          </tr>
          <tr>
            <td style="padding: 12px 16px; font-weight: 600; color: #64748b;">Reporting Coordinator:</td>
            <td style="padding: 12px 16px; color: #0f172a;">${reporting_manager}</td>
          </tr>
        </tbody>
      </table>

      <!-- Section: Document 1 — Offer Letter Highlights -->
      <div style="margin-bottom: 28px;">
        <h3 style="margin: 0 0 12px 0; font-size: 16px; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">
          📄 Document 1: Sales Partner Offer Terms
        </h3>
        <p style="margin: 0 0 10px 0; font-size: 13.5px; color: #475569;">
          Nobogent provides an AI-powered growth system for real estate businesses, combining marketing tools, CRM, automation and sales infrastructure. As a Sales Partner, your role is to help real estate businesses discover and adopt Nobogent's solutions.
        </p>
        <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #475569;">
          <li style="margin-bottom: 4px;"><strong>Performance-Based:</strong> Commission-only engagement without a fixed salary.</li>
          <li style="margin-bottom: 4px;"><strong>Training & Enablement:</strong> Product demonstrations, scripts, objection handling, and platform access provided.</li>
          <li style="margin-bottom: 4px;"><strong>Leads & Support:</strong> Qualified sales leads and CRM support as agreed under the program.</li>
        </ul>
      </div>

      <!-- Section: Document 2 — Commission Structure & Performance Plan -->
      <div style="margin-bottom: 28px;">
        <h3 style="margin: 0 0 12px 0; font-size: 16px; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">
          💰 Document 2: Sales Performance Plan & Commission Slabs
        </h3>
        <p style="margin: 0 0 10px 0; font-size: 13.5px; color: #475569;">
          <strong>Build the base. Keep the growth:</strong> Your monthly number of active, paying customers sets your rate across all eligible customers in your portfolio.
        </p>

        <!-- Slabs Table in Email -->
        <table style="width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; font-size: 13px; margin-bottom: 14px;">
          <thead>
            <tr style="background-color: #f1f5f9; text-align: left;">
              <th style="padding: 8px 12px; border: 1px solid #e2e8f0; color: #475569;">Active Paying Customers</th>
              <th style="padding: 8px 12px; border: 1px solid #e2e8f0; color: #475569;">Monthly Rate Per Customer</th>
            </tr>
          </thead>
          <tbody>
            <tr><td style="padding: 7px 12px; border: 1px solid #e2e8f0;">1–5 customers</td><td style="padding: 7px 12px; border: 1px solid #e2e8f0; font-weight: 700; color: #2563eb;">₹400 / customer</td></tr>
            <tr><td style="padding: 7px 12px; border: 1px solid #e2e8f0;">6–10 customers</td><td style="padding: 7px 12px; border: 1px solid #e2e8f0; font-weight: 700; color: #2563eb;">₹500 / customer</td></tr>
            <tr><td style="padding: 7px 12px; border: 1px solid #e2e8f0;">11–20 customers</td><td style="padding: 7px 12px; border: 1px solid #e2e8f0; font-weight: 700; color: #2563eb;">₹600 / customer</td></tr>
            <tr><td style="padding: 7px 12px; border: 1px solid #e2e8f0;">21–30 customers</td><td style="padding: 7px 12px; border: 1px solid #e2e8f0; font-weight: 700; color: #2563eb;">₹700 / customer</td></tr>
            <tr><td style="padding: 7px 12px; border: 1px solid #e2e8f0;">31–40 customers</td><td style="padding: 7px 12px; border: 1px solid #e2e8f0; font-weight: 700; color: #2563eb;">₹800 / customer</td></tr>
            <tr><td style="padding: 7px 12px; border: 1px solid #e2e8f0;">41–50 customers</td><td style="padding: 7px 12px; border: 1px solid #e2e8f0; font-weight: 700; color: #2563eb;">₹900 / customer</td></tr>
            <tr style="background-color: #eff6ff;"><td style="padding: 7px 12px; border: 1px solid #e2e8f0; font-weight: 700; color: #1e40af;">51+ customers (Top Tier)</td><td style="padding: 7px 12px; border: 1px solid #e2e8f0; font-weight: 800; color: #1e40af;">₹1,000 / customer</td></tr>
          </tbody>
        </table>

        <!-- Milestone Rewards Box -->
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; margin-bottom: 12px; font-size: 13px;">
          <strong style="color: #0f172a; display: block; margin-bottom: 6px;">🏆 Milestone Rewards (Consistency Rewards):</strong>
          <ul style="margin: 0; padding-left: 18px; color: #475569; line-height: 1.5;">
            <li><strong>Retention Champion:</strong> 10+ customers for 3 consecutive months → Cash bonus / gift</li>
            <li><strong>Growth Champion:</strong> 25+ customers for 3 consecutive months → Premium reward / bonus</li>
            <li><strong>Dubai Achiever:</strong> 50+ customers for 6 consecutive months → Company-sponsored Dubai trip*</li>
          </ul>
        </div>

        <p style="margin: 0; font-size: 12px; color: #64748b; font-style: italic;">
          *Commissions and milestone rewards are calculated on monthly collected subscriptions and paid by the 10th of each calendar month.
        </p>
      </div>

      <!-- Section: Document 3 — CRM & Code of Conduct -->
      <div style="margin-bottom: 28px;">
        <h3 style="margin: 0 0 12px 0; font-size: 16px; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">
          🛡️ Document 3: CRM Policy & Code of Conduct
        </h3>
        <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #475569; line-height: 1.6;">
          <li>All assigned leads, notes, and call outcomes must be logged strictly inside Nobogent CRM.</li>
          <li>Strict confidentiality applies to all customer records, pricing, and company assets. Data export or misuse is prohibited.</li>
          <li>Professional conduct: no misleading representations, accurate product explanations, and respectful client communication.</li>
        </ul>
      </div>

      <!-- Section: Document 4 — 30-Day Roadmap -->
      <div style="margin-bottom: 28px;">
        <h3 style="margin: 0 0 12px 0; font-size: 16px; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">
          📅 Document 4: First 30 Days Roadmap
        </h3>
        <div style="background-color: #f8fafc; border-left: 3px solid #2563eb; padding: 12px 16px; font-size: 13px; color: #475569;">
          <strong>Week 1:</strong> Learn product & pitch • <strong>Week 2:</strong> Begin prospecting & calling • <strong>Week 3:</strong> Demonstrations & objection handling • <strong>Week 4:</strong> Performance & closing review.
        </div>
      </div>

      <!-- Section: Document 5 — Partner Agreement Acknowledgment -->
      <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 20px; margin-bottom: 28px;">
        <h3 style="margin: 0 0 12px 0; font-size: 15px; color: #0f172a;">
          ✅ Document 5: Partner Agreement Acknowledgment
        </h3>
        <p style="margin: 0 0 12px 0; font-size: 13px; color: #475569;">
          The partner has reviewed and digitally accepted all terms, understanding the commission-only nature, performance slabs, CRM obligations, and formal agreement terms.
        </p>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <tr>
            <td style="padding: 6px 0; color: #64748b; width: 40%;">Partner Name:</td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: 700;">${partner_name}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Acknowledgment Status:</td>
            <td style="padding: 6px 0; color: #166534; font-weight: 700;">✓ Accepted & Agreed via Verified Checkboxes</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Execution Date:</td>
            <td style="padding: 6px 0; color: #0f172a;">${formattedSignedDate}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Verification ID:</td>
            <td style="padding: 6px 0; color: #0f172a; font-family: monospace;">NBG-PARTNER-${Date.now().toString(36).toUpperCase()}</td>
          </tr>
        </table>
      </div>

      <!-- Next Steps Call to Action -->
      <div style="text-align: center; padding: 20px; background-color: #eff6ff; border-radius: 8px; border: 1px solid #bfdbfe;">
        <h4 style="margin: 0 0 6px 0; color: #1e40af; font-size: 15px;">Next Step: Onboarding Orientation</h4>
        <p style="margin: 0 0 14px 0; font-size: 13px; color: #3b82f6;">
          Your manager (<strong>${reporting_manager}</strong>) will connect with you to issue your platform credentials, schedule your product training, and assign initial leads.
        </p>
        <a href="mailto:info@nobogent.com" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 10px 22px; border-radius: 6px; font-size: 13px; font-weight: 600;">
          Contact Nobogent Partnerships Team
        </a>
      </div>

    </div>

    <!-- Footer -->
    <div style="background-color: #f1f5f9; padding: 20px 36px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #64748b;">
      <p style="margin: 0 0 4px 0;"><strong>NOBOGENT AI SOLUTIONS LLP</strong></p>
      <p style="margin: 0 0 8px 0;">Empowering Real Estate with Autonomous AI Infrastructure</p>
      <p style="margin: 0; color: #94a3b8;">
        This automated transmission serves as your confirmation and digital copy of the agreed Sales Partner Onboarding Pack.
      </p>
    </div>

  </div>
</body>
</html>
    `;

    // B. Internal Admin Notification Email
    const adminEmailHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <h2 style="color: #0f172a; margin-top: 0; border-bottom: 2px solid #2563eb; padding-bottom: 10px;">
          🤝 New Sales Partner Agreement Accepted
        </h2>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr><td style="padding: 8px 0; color: #64748b; width: 140px;">Partner Name:</td><td style="padding: 8px 0; font-weight: bold; color: #0f172a;">${partner_name}</td></tr>
          <tr><td style="padding: 8px 0; color: #64748b;">Email:</td><td style="padding: 8px 0; font-weight: bold; color: #2563eb;"><a href="mailto:${email}">${email}</a></td></tr>
          <tr><td style="padding: 8px 0; color: #64748b;">Phone:</td><td style="padding: 8px 0; font-weight: bold;"><a href="tel:${cleanPhone}">${cleanPhone}</a></td></tr>
          <tr><td style="padding: 8px 0; color: #64748b;">City:</td><td style="padding: 8px 0;">${city || 'N/A'}</td></tr>
          <tr><td style="padding: 8px 0; color: #64748b;">Proposed Start:</td><td style="padding: 8px 0;">${start_date || 'Immediate'}</td></tr>
          <tr><td style="padding: 8px 0; color: #64748b;">Reporting Manager:</td><td style="padding: 8px 0;">${reporting_manager}</td></tr>
          <tr><td style="padding: 8px 0; color: #64748b;">Experience:</td><td style="padding: 8px 0;">${experience || 'None noted'}</td></tr>
          <tr><td style="padding: 8px 0; color: #64748b;">Agreement Terms:</td><td style="padding: 8px 0; color: #166534; font-weight: bold;">✓ All 4 Policy Checkboxes Verified</td></tr>
          <tr><td style="padding: 8px 0; color: #64748b;">Partner Notes:</td><td style="padding: 8px 0;">${partnerNotes || 'None'}</td></tr>
        </table>
        <p style="font-size: 12px; color: #64748b;">Recorded in Supabase CRM (Lead ID: ${leadId || 'Generated'})</p>
      </div>
    `;

    // Send emails
    let partnerMailSent = false;
    let mailError = null;

    try {
      // 1. Send confirmation to Partner
      const partnerMailResult = await transporter.sendMail({
        from: '"NOBOGENT AI SOLUTIONS" <info@nobogent.com>',
        to: email,
        replyTo: 'info@nobogent.com',
        subject: `Sales Partner Agreement Confirmed: Welcome ${partner_name} - Nobogent AI`,
        html: partnerEmailHtml
      });
      partnerMailSent = Boolean(partnerMailResult && partnerMailResult.messageId);

      // 2. Send notification to Company
      await transporter.sendMail({
        from: '"Nobogent Partner Portal" <info@nobogent.com>',
        to: 'info@nobogent.com, rchopra489@gmail.com',
        subject: `🔥 New Sales Partner Signed: ${partner_name} (${city || 'India'})`,
        html: adminEmailHtml
      }).catch(e => console.warn('[Partner API] Admin mail warning:', e));

    } catch (err) {
      console.error('[Partner API] Mail dispatch error:', err);
      mailError = err.message;
    }

    return res.status(200).json({
      success: true,
      lead_id: leadId,
      email_sent: partnerMailSent,
      message: partnerMailSent
        ? `Partner agreement submitted successfully. A confirmation copy has been sent to ${email}.`
        : `Partner agreement submitted successfully. Confirmation recorded.`
    });

  } catch (err) {
    console.error('[Partner API] Unexpected handler error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
