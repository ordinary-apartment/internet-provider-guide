export function parseCSV(text) {
  const rows=[];let row=[],field='',quoted=false;
  text=text.replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
    else if(c===','&&!quoted){row.push(field);field='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(Boolean))rows.push(row);row=[];field='';}
    else field+=c;
  }
  if(quoted)throw new Error('CSVの引用符が閉じていません');
  if(field||row.length){row.push(field);rows.push(row);}
  if(!rows.length)throw new Error('CSVが空です');
  const head=rows.shift();if(new Set(head).size!==head.length)throw new Error('CSV列が重複しています');
  return rows.map((cells,i)=>{
    if(cells.length!==head.length)throw new Error(`CSV ${i+2}行目の列数が違います`);
    return Object.fromEntries(head.map((key,j)=>[key,cells[j]==='NULL'||cells[j]===''?null:cells[j]]));
  });
}
export const num=v=>v===null||v===undefined||v===''||v==='NULL'?null:(Number.isFinite(Number(v))?Number(v):null);
export function validateRows(rows){
  const seen=new Set();
  for(const row of rows){
    if(!row.record_id||seen.has(row.record_id))throw new Error('商品IDが不足・重複しています');seen.add(row.record_id);
    if(!['house','apartment'].includes(row.housing_type))throw new Error('住宅タイプが不正です');
    if(!['fixed','wireless'].includes(row.category))throw new Error('回線カテゴリが不正です');
    for(const key of ['official_url','area_check_url']){if(!/^https:\/\//.test(row[key]||''))throw new Error('公式リンクが不正です');}
    for(const key of ['normal_monthly_fee','mandatory_monthly_fee','max_down_mbps','max_up_mbps']){
      if(row[key]!==null&&(num(row[key])===null||num(row[key])<0))throw new Error('料金・速度の数値が不正です');
    }
  }
  return rows;
}
export const defaults={housing:'apartment',prefecture:'',contractFilter:'include',downSpeed:'all',carrier:'なし',people:1,devices:0,work:1,game:0,video:1,stream:0,connection:0,priority:0,discountLines:0};
export function requirements(input,rules){
  const p=Number(input.people),simultaneous=Math.max(1,Math.ceil(p*.6));
  const viewers=input.video===3?p:1;
  const workParallel=input.work===4?simultaneous:1;
  const rawDown=rules.work_down[input.work]*workParallel+rules.game_down[input.game]+rules.video_down[input.video]*viewers+rules.device_background[input.devices];
  const rawUp=rules.work_up[input.work]*workParallel+rules.game_up[input.game]+rules.stream_up[input.stream]+rules.device_background[input.devices]/4;
  const down=Math.max(10,Math.ceil(rawDown*rules.planning_headroom));
  const up=Math.max(5,Math.ceil(rawUp*rules.planning_headroom));
  const targetDown=down*rules.nominal_reserve_factor,targetUp=up*rules.nominal_reserve_factor;
  const high=targetDown>1000||targetUp>1000;
  const latency=input.game===2||input.game===3||input.priority===4;
  const stability=input.work>=2||input.stream>0||input.priority===2||latency;
  const wifi=input.connection!==1&&(input.devices>=2||latency||input.work>=2||input.stream>0);
  return {down,up,targetDown,targetUp,high,latency,stability,wifi,simultaneous,workParallel,viewers,
    jitterSensitive:stability,lossSensitive:stability,
    wifiLoad:['低め','標準','高め','高い'][input.devices],
    latencyTarget:input.game===3?80:latency?30:null,
    title:high?'大容量の同時通信なら高速プランも候補':'まずは1G回線を比較',
    advice:latency&&input.connection!==1?'ゲーム機は有線LAN接続を優先':latency?'帯域は1Gを基準に。Ping・揺らぎ・ロスを実測確認':wifi?'Wi-Fiルーターの配置・性能を見直すと効果的':high&&input.connection!==1?'高速プランは対応ルーター・有線LANも確認':'必要な帯域を満たしたら、通常料金で選ぶ'};
}
export function monthly(row){
  const base=num(row.normal_monthly_fee),required=num(row.mandatory_monthly_fee);
  if(base===null||required===null||row.provider_fee_included==='false')return null;
  return base+required;
}
export function total24(row){
  const m=monthly(row),init=num(row.initial_fee),construction=num(row.construction_fee),required=num(row.mandatory_one_time_fee);
  if([m,init,construction,required].some(v=>v===null))return null;
  // A known first-year price does not establish all 24 monthly payments.
  if(row.monthly_fee_schedule&&row.monthly_fee_schedule!=='NULL')return null;
  return m*24+init+construction+required;
}
export function discount(row,input){
  const matches=(row.smartphone_carrier||'').split('|').includes(input.carrier);
  if(!matches||input.discountLines===0)return {matches,amount:0,net:null,confirmed:false};
  const max=num(row.smartphone_discount_max),option=num(row.discount_required_option_fee);
  if(max===null||option===null)return {matches,amount:null,net:null,confirmed:false};
  const lines=row.discount_scope==='fixed'?1:Math.max(0,Math.min(10,input.discountLines));
  return {matches,amount:max*lines,net:max*lines-option,confirmed:true};
}
export function evaluate(row,input,rules,need=requirements(input,rules)){
  const down=num(row.max_down_mbps),up=num(row.max_up_mbps),m=monthly(row);
  const downShort=down!==null&&down<need.targetDown;
  const upShort=up!==null&&up<need.targetUp;
  const unresolved=down===null||up===null;
  const insufficient=downShort||upShort;
  const constrained=!!row.congestion_policy&&row.congestion_policy!=='NULL';
  const overkill=down!==null&&down>=5000&&!need.high;
  const explicitUp=need.up>=20;
  const tier=insufficient?2:((down===null||(explicitUp&&up===null))?1:0);
  let score=100;
  if(insufficient)score-=45;
  if(unresolved)score-=8;
  if(constrained&&(need.stability||input.video>=2))score-=rules.managed_congestion_penalty;
  if(overkill)score-=rules.overkill_penalty;
  if(need.latency&&row.dedicated_bandwidth==='true')score+=4;
  score=Math.max(0,Math.min(100,score));
  const d=discount(row,input);
  const economic=m===null?Infinity:m-(d.confirmed?d.net:0);
  // Explicit planning penalties are expressed in yen for sorting after suitability tier.
  const lifecycle=total24(row);
  let cost=economic;
  const performanceOption=need.stability?num(row.ipv6_option_monthly_fee):null;
  if(performanceOption!==null)cost+=performanceOption;
  if(overkill)cost+=1200;
  if(constrained&&(need.stability||input.video>=2))cost+=1200;
  if(need.latency&&row.dedicated_bandwidth==='true')cost-=250;
  if(input.priority===3&&need.high&&down!==null)cost-=Math.min(700,down/20);
  let verdict=insufficient?'帯域の仕様を再確認':tier===1?'上り・速度を要確認':unresolved?'上り仕様を要確認':overkill?'この用途では過剰':need.high?'大容量の同時利用に':constrained?'混雑時の制御に注意':'これで十分';
  if(!insufficient&&!overkill&&need.latency&&row.dedicated_bandwidth==='true')verdict='ゲーム向けの専用帯域';
  else if(!insufficient&&!overkill&&need.latency&&tier===0)verdict='帯域十分・遅延確認';
  if(m===null)verdict='通常料金を要確認';
  if(row.status!=='active')verdict='新規受付・条件を確認';
  return {row,score,tier,cost,monthly:m,discount:d,overkill,insufficient,unresolved,constrained,verdict,total24:lifecycle};
}
export function rank(rows,input,rules,category='fixed'){
  const need=requirements(input,rules);
  const matching=rows.filter(r=>(input.contractFilter!=='none'||num(r.contract_period)===0)&&r.housing_type===input.housing&&r.category===category&&(category!=='fixed'||!input.downSpeed||input.downSpeed==='all'||(input.downSpeed==='under1g'?num(r.max_down_mbps)!==null&&num(r.max_down_mbps)<1000:input.downSpeed==='unknown'?num(r.max_down_mbps)===null:num(r.max_down_mbps)===num(input.downSpeed)))&&(!input.prefecture||!r.area_prefectures||r.area_prefectures.split('|').includes(input.prefecture))&&!['ended','new_sales_ended','excluded'].includes(r.status));
  const evaluated=matching.map(r=>evaluate(r,input,rules,need));
  const qualifies=x=>x.row.status==='active'&&x.monthly!==null&&!(x.row.eligibility==='ahamo契約が必要'&&input.carrier!=='ahamo');
  const eligible=evaluated.filter(qualifies);
  const pending=evaluated.filter(x=>!qualifies(x));
  eligible.sort((a,b)=>a.tier-b.tier||a.cost-b.cost||(a.total24!==null&&b.total24!==null?a.total24-b.total24:0)||b.score-a.score||a.row.record_id.localeCompare(b.row.record_id,'en'));
  pending.sort((a,b)=>a.row.service_name.localeCompare(b.row.service_name,'ja')||a.row.record_id.localeCompare(b.row.record_id,'en'));
  return {need,eligible,pending};
}

export function pendingReasons(row,input){
 const reasons=[];
 if(row.pending_review_reason&&row.pending_review_reason!=='NULL')reasons.push(row.pending_review_reason);
 if(row.status!=='active'&&!row.pending_review_reason)reasons.push('新規受付・プラン条件の調査未完了');
 if(num(row.normal_monthly_fee)===null&&!row.pending_review_reason)reasons.push(num(row.monthly_fee_min)!==null?'建物・利用量で料金が変動':'通常月額の調査未完了');
 if(row.provider_fee_included==='false')reasons.push('別契約プロバイダー料金が必要');
 else if(num(row.mandatory_monthly_fee)===null&&!row.pending_review_reason)reasons.push('必須月額費用の調査未完了');
 if(row.eligibility==='ahamo契約が必要'&&input.carrier!=='ahamo')reasons.push('ahamo契約が必要');
 return reasons;
}
