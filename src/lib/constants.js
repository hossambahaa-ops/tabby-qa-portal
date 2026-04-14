/* ═══ ROLE SYSTEM ═══ */
export const ROLE_LEVEL={qa:1,senior_qa:3,qa_lead:3,qa_supervisor:4,admin:5,super_admin:6};
export const ROLE_LABELS={qa:"QA",senior_qa:"Senior QA",qa_lead:"QA Lead",auditor:"Auditor",qa_supervisor:"QA Supervisor",admin:"Admin",super_admin:"Super Admin"};
export const hasRole=(r,min)=>(ROLE_LEVEL[r]||0)>=(ROLE_LEVEL[min]||99);

// Chronological month sort (newest first): "Mar-2026" > "Feb-2026" > "Jan-2026"
export const MONTH_IDX={Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
export const sortMonthsDesc=(months)=>[...months].sort((a,b)=>{const[am,ay]=a.split("-");const[bm,by]=b.split("-");return(parseInt(by)||0)-(parseInt(ay)||0)||(MONTH_IDX[bm]??0)-(MONTH_IDX[am]??0);});

export const defaultFilters = { domain: "", teams: [], month: "", people: [] };
