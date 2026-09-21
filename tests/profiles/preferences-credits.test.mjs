import assert from "node:assert/strict";
import {test} from "node:test";
import load from "../load.mjs";
const prefs=load("lib/profiles/project-preferences.ts"),cv=load("lib/profiles/credits.ts");
test("preferences default unspecified; open formats never imply sensitive participation",()=>{
 const p=prefs.parseProjectPreferences({...prefs.EMPTY_PREFERENCES,open_formats:true});
 assert.equal(Object.keys(p.participation).length,0);
 assert.equal(prefs.parseProjectPreferences({...p,participation:{nudity:"yes"}}),null);
 assert.equal(prefs.parseProjectPreferences({...p,conditions:{unknown:"accept"}}),null);
 assert.equal(prefs.parseProjectPreferences({...p,visibility:"public"}),null);
 assert.equal(prefs.parseProjectPreferences({...p,participation:{nudity:"decline"}}).participation.nudity,"decline");
});
test("CV preserves partial dates, validates ranges and sorts ties stably without inventing months",()=>{
 const base={title:"Film",role:"DP",year:"2024"};
 assert.equal(cv.creditPeriod(base),"2024");
 assert.equal(cv.parseCredit({...base,start:"2024-13"}),null);
 assert.equal(cv.parseCredit({...base,start:"2025",end:"2024"}),null);
 assert.equal(cv.parseCredit({...base,ongoing:true,end:"2026"}),null);
 assert.equal(cv.parseCredit({...base,url:"javascript:alert(1)"}),null);
 const entries=[{...base,title:"A"},{...base,title:"B"},{...base,title:"C",start:"2025-04",ongoing:true}];
 assert.deepEqual(Array.from(cv.sortedCredits(entries),c=>c.title),["C","A","B"]);
 assert.equal(cv.creditPeriod(entries[2]),"2025-04 — En curso");
});
