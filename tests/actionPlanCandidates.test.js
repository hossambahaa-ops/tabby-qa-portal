import { describe, it, expect } from 'vitest';
import { buildPlanCandidates } from '../src/lib/actionPlan.js';

const nameFromEmail = (e) => (e || '').split('@')[0];

const roster = [
  { email: 'qa.one@tabby.sa', display_name: 'QA One', manager_email: 'munirah.alfhaid.97@tabby.sa' },
  { email: 'qa.two@tabby.ai', display_name: 'QA Two', manager_email: 'someone@tabby.ai' },
];
const profiles = [
  { email: 'munirah.alfhaid.97@tabby.sa', role: 'qa_lead', display_name: 'munirah alfhaid', operational_domain: 'tabby.sa' },
  { email: 'hassan.mokhtar@tabby.sa', role: 'qa_supervisor', display_name: 'Hassan Mokhtar', operational_domain: 'tabby.sa' },
  { email: 'other.lead@tabby.ai', role: 'qa_lead', display_name: 'Other Lead', operational_domain: 'tabby.ai' },
  { email: 'qa.one@tabby.sa', role: 'qa', display_name: 'QA One', operational_domain: 'tabby.sa' },
];

describe('buildPlanCandidates', () => {
  it('a plain lead gets only the roster (no management added)', () => {
    const out = buildPlanCandidates({ roster, profiles, isSupervisor: false, isAdmin: false, myEmail: 'munirah.alfhaid.97@tabby.sa', myDomain: 'tabby.sa', nameFromEmail });
    expect(out).toBe(roster);
  });

  it('a supervisor can pick an in-domain lead (the hassan -> munirah fix)', () => {
    const out = buildPlanCandidates({ roster, profiles, isSupervisor: true, isAdmin: false, myEmail: 'hassan.mokhtar@tabby.sa', myDomain: 'tabby.sa', nameFromEmail });
    const emails = out.map(r => r.email);
    expect(emails).toContain('munirah.alfhaid.97@tabby.sa'); // now selectable
    expect(emails).not.toContain('hassan.mokhtar@tabby.sa'); // self excluded
    expect(emails).not.toContain('other.lead@tabby.ai');     // cross-domain lead excluded
    expect(emails).toContain('qa.one@tabby.sa');             // roster preserved
    expect(out.find(r => r.email === 'munirah.alfhaid.97@tabby.sa').roleLabel).toBe('Lead');
  });

  it('does not duplicate a roster member who also has a profile row', () => {
    const out = buildPlanCandidates({ roster, profiles, isSupervisor: true, isAdmin: false, myEmail: 'hassan.mokhtar@tabby.sa', myDomain: 'tabby.sa', nameFromEmail });
    expect(out.filter(r => r.email === 'qa.one@tabby.sa').length).toBe(1);
  });

  it('an admin sees leads and supervisors across all domains', () => {
    const out = buildPlanCandidates({ roster, profiles, isSupervisor: true, isAdmin: true, myEmail: 'admin@tabby.ai', myDomain: 'tabby.ai', nameFromEmail });
    const emails = out.map(r => r.email);
    expect(emails).toContain('munirah.alfhaid.97@tabby.sa');
    expect(emails).toContain('other.lead@tabby.ai');
    expect(emails).toContain('hassan.mokhtar@tabby.sa');
  });
});
