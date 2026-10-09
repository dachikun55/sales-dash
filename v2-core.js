import {validate as validateLegacy,validDate,parseCSV,fromCSV as readLegacy} from './core.js';
export const blank=()=>({version:2,settings:{mode:"all",yearStart:1},companies:[],products:[],sales:[],goals:[],campaigns:[],holidays:[],legacy:{version:1,months:{}}});
const money=n=>Number.isSafeInteger(n)&&n>=0;
const month=s=>typeof s==='string'&&/^(19\d{2}|20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(s);
const date=s=>typeof s==='string'&&validDate(s)&&month(s.slice(0,7));
export function goalKey(g){return [g.kind,g.period,g.company??'',g.product??''].join('|');}
export function validateV2(d){
 if(!d||d.version!==2)throw Error('Ver.2の形式ではありません');
 for(const k of ['companies','products','sales','goals','campaigns','holidays'])if(!Array.isArray(d[k]))throw Error(k+'の形式が不正です');
 validateLegacy(d.legacy);
 if(d.settings!==undefined&&(!d.settings||!['all','company','product','pair'].includes(d.settings.mode)||!Number.isInteger(d.settings.yearStart)||d.settings.yearStart<1||d.settings.yearStart>12))throw Error('管理方法・年度設定が不正です');
 for(const k of ['companies','products','sales','campaigns']){const ids=new Set();for(const x of d[k]){if(typeof x.id!=='string'||!x.id||x.id.length>100||ids.has(x.id))throw Error('IDが不正または重複しています');ids.add(x.id);}}
 for(const k of ['companies','products','campaigns'])for(const x of d[k])if(typeof x.name!=='string'||!x.name.trim()||x.name.length>60)throw Error('名称は1〜60文字です');
 for(const k of ['companies','products'])if(new Set(d[k].map(x=>x.name)).size!==d[k].length)throw Error('名称が重複しています');
 const exists=(k,id)=>d[k].some(x=>x.id===id);
 for(const s of d.sales)if(!date(s.date)||!money(s.amount)||(s.company!=null&&s.company!==''&&!exists('companies',s.company))||(s.product!=null&&s.product!==''&&!exists('products',s.product)))throw Error('売上明細の日付・金額・会社・商品が不正です');
 const keys=new Set();for(const g of d.goals){if(typeof g.period!=='string'||!['all','company','product','pair'].includes(g.kind)||(!month(g.period)&&!(/^(19\d{2}|20\d{2}|2100)$/.test(g.period)))||!money(g.target))throw Error('目標が不正です');if(g.kind==='pair'&&!month(g.period))throw Error('会社×商品の目標は月間のみです');if(['company','pair'].includes(g.kind)?!exists('companies',g.company):g.company!=='')throw Error('目標の会社が不正です');if(['product','pair'].includes(g.kind)?!exists('products',g.product):g.product!=='')throw Error('目標の商品が不正です');if(keys.has(goalKey(g)))throw Error('目標が重複しています');keys.add(goalKey(g));}
 if(d.campaigns.length>3)throw Error('キャンペーンは最大3件です');
 for(const c of d.campaigns)if(!date(c.start)||!date(c.end)||c.start>c.end||!money(c.target)||(c.company!==''&&!exists('companies',c.company))||(c.product!==''&&!exists('products',c.product)))throw Error('キャンペーンの期間・対象・目標が不正です');
 if(d.holidays.some(s=>!date(s)))throw Error('休日が不正です');
 sumSales(d.sales);for(const g of d.goals.filter(g=>g.period.length===4))consistency(d,g);return d;
}
export function migrate(old){validateLegacy(old);const d=blank();d.legacy=structuredClone(old);for(const [period,m] of Object.entries(old.months)){d.goals.push({kind:'all',period,company:'',product:'',target:m.target});d.holidays.push(...m.holidays);}d.holidays=[...new Set(d.holidays)];return validateV2(d);}
export function sumSales(rows){let n=0;for(const r of rows){n+=r.amount;if(!Number.isSafeInteger(n))throw Error('売上合計が扱える金額の上限を超えています');}return n;}
export const settings=d=>d.settings??{mode:'pair',yearStart:1};
export function upgrade(d){validateV2(d);const next=structuredClone(d);next.settings??={mode:'pair',yearStart:1};return next;}
export function fiscalYear(month,start=1){return Number(month.slice(0,4))-(Number(month.slice(5,7))<start?1:0);}
export function fiscalMonths(year,start=1){return Array.from({length:12},(_,i)=>{const m=start-1+i;return `${Number(year)+Math.floor(m/12)}-${String(m%12+1).padStart(2,'0')}`;});}
export function filtered(d,{period,company='',product='',start='',end=''}={}){const months=period?.length===4?fiscalMonths(period,settings(d).yearStart):null;const match=(value,filter)=>filter===null?(value??'')==='':!filter||value===filter;return d.sales.filter(s=>(!period||(months?months.includes(s.date.slice(0,7)):s.date.startsWith(period)))&&match(s.company,company)&&match(s.product,product)&&(!start||s.date>=start)&&(!end||s.date<=end));}
export function buildSale(mode,values,previous=null){if(!['all','company','product','pair'].includes(mode))throw Error('管理方法が不正です');const row={...previous,...values};for(const key of ['company','product']){const needed=mode===key||mode==='pair';if(needed){if(!values[key]&&!(previous&&!previous[key]))throw Error((key==='company'?'会社':'商品')+'を選択してください');row[key]=values[key];}else row[key]=previous?.[key]??'';}return row;}

export function progress(target,actual){return {target,actual,rate:target>0?actual/target*100:null,gap:Math.max(0,target-actual),unmet:actual<target};}
export function goalStats(d,g){return progress(g.target,sumSales(filtered(d,{period:g.period,company:g.company,product:g.product})));}
export function campaignStats(d,c){return progress(c.target,sumSales(filtered(d,c)));}
export function ranking(d,kind,period){const entities=d[kind==='company'?'companies':'products'];return entities.map(x=>{const g=d.goals.find(g=>g.kind===kind&&g.period===period&&g[kind]===x.id);const actual=sumSales(filtered(d,{period,[kind]:x.id}));return {...x,...progress(g?.target??0,actual),hasGoal:!!g};}).sort((a,b)=>b.actual-a.actual||a.name.localeCompare(b.name,'ja'));}
export function consistency(d,g){const months=fiscalMonths(g.period,settings(d).yearStart);const goals=d.goals.filter(x=>x.kind===g.kind&&x.company===g.company&&x.product===g.product&&months.includes(x.period));const total=goals.reduce((n,x)=>n+x.target,0);if(!Number.isSafeInteger(total))throw Error('月別目標の合計が上限を超えています');return {count:goals.length,total,difference:total-g.target};}
const cols=['version','type','data'];
export function exportV2(d){validateV2(d);const rows=[cols,['2','legacy',JSON.stringify(d.legacy)],['2','settings',JSON.stringify(settings(d))]];for(const k of ['companies','products','sales','goals','campaigns','holidays'])for(const x of d[k])rows.push(['2',k,JSON.stringify(x)]);return '\uFEFF'+rows.map(r=>r.map(v=>'"'+v.replaceAll('"','""')+'"').join(',')).join('\r\n');}
export function importV2(text){const rows=parseCSV(text);if(rows[0]?.[0]==='version'&&rows[0]?.[1]==='month')return {legacy:true,data:readLegacy(text)};if(JSON.stringify(rows.shift())!==JSON.stringify(cols))throw Error('営業ダッシュ！のCSVを選択してください');const d=blank();delete d.settings;let legacy=false,hasSettings=false;for(const r of rows){if(r.length!==3||r[0]!=='2')throw Error('CSVの列・バージョンが不正です');if(r[1]==='legacy'){if(legacy)throw Error('旧データが重複しています');d.legacy=JSON.parse(r[2]);legacy=true;}else if(r[1]==='settings'){if(hasSettings)throw Error('設定が重複しています');d.settings=JSON.parse(r[2]);hasSettings=true;}else if(['companies','products','sales','goals','campaigns','holidays'].includes(r[1]))d[r[1]].push(JSON.parse(r[2]));else throw Error('不明なデータ種別です');}if(!legacy)throw Error('バックアップに旧データ欄がありません');return {legacy:false,data:upgrade(d)};}
