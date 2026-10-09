export const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export const emptyMonth = () => ({target:0,actual:0,previous:0,holidays:[],campaigns:[]});
export function validDate(s) { if(!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; const d=new Date(`${s}T12:00:00`); return !isNaN(d) && localDate(d)===s; }
export function validate(data) {
 if(data?.version!==1 || !data.months || typeof data.months!=='object' || Array.isArray(data.months)) throw Error('対応していないデータ形式です');
 for(const [month,m] of Object.entries(data.months)) {
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || +month.slice(0,4)<1900 || +month.slice(0,4)>2100) throw Error('年月が不正です');
 for(const key of ['target','actual','previous']) if(!Number.isSafeInteger(m[key])||m[key]<0) throw Error('金額は0以上の整数で指定してください');
 if(!Array.isArray(m.holidays)||m.holidays.some(d=>!validDate(d)||!d.startsWith(month))) throw Error('休日の日付が不正です');
 if(!Array.isArray(m.campaigns)||m.campaigns.length>3) throw Error('キャンペーンは最大3件です');
 for(const c of m.campaigns) if(typeof c.name!=='string'||!c.name.trim()||c.name.length>60||!Number.isSafeInteger(c.target)||c.target<0||!Number.isSafeInteger(c.actual)||c.actual<0) throw Error('キャンペーンの内容が不正です');
 } return data;
}
export function metrics(month,m,today=localDate()) {
 const [y,mo]=month.split('-').map(Number); let days=0,total=0;
 for(let n=1;n<=new Date(y,mo,0).getDate();n++){const d=new Date(y,mo-1,n,12);const key=localDate(d);if(d.getDay()!==0&&d.getDay()!==6&&!m.holidays.includes(key)){total++;if(key>=today)days++;}}
 const gap=Math.max(0,m.target-m.actual);return {days,total,gap,rate:m.target>0?m.actual/m.target*100:null,yoy:m.previous>0?(m.actual/m.previous-1)*100:null,daily:gap===0?0:days>0?Math.ceil(gap/days):null};
}
const columns=['version','month','type','name','target','actual','previous','date'];
export function toCSV(data){validate(data);const rows=[columns];for(const [month,m] of Object.entries(data.months).sort()){rows.push([1,month,'sales','',m.target,m.actual,m.previous,'']);for(const d of m.holidays)rows.push([1,month,'holiday','','','','',d]);for(const c of m.campaigns)rows.push([1,month,'campaign',c.name,c.target,c.actual,'','']);}return '\uFEFF'+rows.map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n');}
export function parseCSV(text){text=text.replace(/^\uFEFF/,'');let rows=[],row=[],field='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else if(quoted){quoted=false;if(text[i+1]&&!/[\r\n,]/.test(text[i+1]))throw Error('CSVの引用符が不正です');}else {if(field)throw Error('CSVの引用符が不正です');quoted=true;}}else if(c===','&&!quoted){row.push(field);field='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(x=>x!==''))rows.push(row);row=[];field='';}else field+=c;}if(quoted)throw Error('CSVの引用符が閉じられていません');if(field||row.length){row.push(field);rows.push(row);}return rows;}
export function fromCSV(text){const rows=parseCSV(text);if(JSON.stringify(rows.shift())!==JSON.stringify(columns))throw Error('営業ダッシュ！から出力したCSVを選択してください');const data={version:1,months:{}};const sales=new Set();const number=s=>{if(!/^\d+$/.test(s))throw Error('金額が不正です');return Number(s);};for(const r of rows){if(r.length!==8||r[0]!=='1')throw Error('CSVの列数・バージョンが不正です');const [v,month,type,name,target,actual,previous,date]=r;const m=data.months[month]??=emptyMonth();if(type==='sales'){if(sales.has(month))throw Error('売上行が重複しています');sales.add(month);Object.assign(m,{target:number(target),actual:number(actual),previous:number(previous)});}else if(type==='holiday')m.holidays.push(date);else if(type==='campaign')m.campaigns.push({name,target:number(target),actual:number(actual)});else throw Error('不明な行種別です');}if(!sales.size||Object.keys(data.months).some(m=>!sales.has(m)))throw Error('月間売上行がありません');return validate(data);}
