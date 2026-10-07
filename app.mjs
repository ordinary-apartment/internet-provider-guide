import {parseCSV,validateRows,defaults,rank,num,monthly,total24,requirements,pendingReasons} from './engine.mjs';
let rows=[],rules=null,input={...defaults},category='fixed';const opened=new Set();
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const yen=v=>v===null||v===undefined?'要確認':`¥${Number(v).toLocaleString('ja-JP')}`;
const speed=v=>num(v)===null?'要確認':num(v)>=1000?`${num(v)/1000}Gbps`:`${num(v)}Mbps`;
const housingLabel=()=>input.housing==='house'?'戸建て':'マンション・アパート';
const fields=[
 {key:'housing',label:'住まい',values:['house','apartment'],labels:['戸建て','マンション・アパート'],group:'basic',wide:true},
 {key:'contractFilter',label:'定期契約のプラン',values:['include','none'],labels:['定期契約を含む','定期契約なしのみ'],group:'basic',wide:true},
 {key:'carrier',label:'携帯キャリア',values:['docomo','au','SoftBank','楽天モバイル','UQ mobile','Y!mobile','povo','ahamo','LINEMO','その他','なし'],group:'basic'},
 {key:'people',label:'利用人数',values:[1,2,3,4,5],labels:['1人','2人','3人','4人','5人以上'],numbers:true},
 {key:'devices',label:'接続機器数',values:[0,1,2,3],labels:['1〜3台','4〜7台','8〜15台','16台以上']},
 {key:'work',label:'仕事での利用',values:[0,1,2,3,4],labels:['使わない','Web・メール','Teams・Zoom等','画面共有が多い','大容量ファイルが多い']},
 {key:'game',label:'ゲーム',values:[0,1,2,3],labels:['しない','オンラインゲーム','FPS・格闘ゲーム等','クラウドゲーム']},
 {key:'video',label:'動画視聴',values:[0,1,2,3],labels:['あまり見ない','HD・フルHD','4K','複数台で同時視聴']},
 {key:'stream',label:'動画・ライブ配信',values:[0,1,2],labels:['しない','ライブ配信する','1080p60・ゲーム実況']},
 {key:'connection',label:'接続方法',values:[0,1,2],labels:['Wi-Fi中心','PC・ゲーム機は有線LAN可能','わからない']},
 {key:'priority',label:'優先するもの',values:[0,1,2,3,4],labels:['特にない','料金','安定性','速度','ゲーム']},
 {key:'discountLines',label:'割引対象のスマホ回線数',values:[0,1,2,3,4,5],labels:['未確認','1回線','2回線','3回線','4回線','5回線'],group:'discount',numbers:true}
];
const prefectures=["北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県", "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"];
function renderFields(){
 for(const group of ['basic','usage','discount']){
  $(`#${group}-fields`).innerHTML=fields.filter(f=>(f.group||'usage')===group).map(f=>`<fieldset class="field"><legend>${f.label}</legend><div class="options ${f.wide?'wide':''} ${f.numbers?'numbers':''}">${f.values.map((v,i)=>`<button class="option ${input[f.key]===v?'selected':''}" data-field="${f.key}" data-value="${esc(v)}" aria-pressed="${input[f.key]===v}">${esc(f.labels?.[i]||v)}</button>`).join('')}</div></fieldset>`).join('');
 }
 const housing=$('#basic-fields fieldset');
 housing.insertAdjacentHTML('afterend',`<fieldset class="field"><legend><label for="prefecture">都道府県</label></legend><select id="prefecture"><option value="">指定しない</option>${prefectures.map(p=>`<option value="${p}" ${input.prefecture===p?'selected':''}>${p}</option>`).join('')}</select><p class="field-note">地域が確認できた候補を絞ります。地域未確認の候補も残します。住所ごとの提供可否は公式で確認。</p></fieldset>`);
 $('#prefecture').addEventListener('change',e=>{input.prefecture=e.target.value;opened.clear();renderResults();});
}
function choose(button){
 const f=fields.find(f=>f.key===button.dataset.field),raw=button.dataset.value;
 input[f.key]=f.values.find(v=>String(v)===raw);
 document.querySelectorAll(`[data-field="${f.key}"]`).forEach(b=>{const selected=b.dataset.value===raw;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',selected);});
 opened.clear();renderResults();
}
function detailHTML(e,columns=6){
 const r=e.row,fee=num(r.normal_monthly_fee),required=num(r.mandatory_monthly_fee);
 const entries=[
  ['通常基本料金',yen(fee)+' / 月'],['条件付き料金（通常月額とは別）',num(r.conditional_monthly_fee)===null?'設定なし・未確認':yen(num(r.conditional_monthly_fee))+' / 月：'+(r.conditional_fee_requirements||'適用条件を確認')],['料金の再確認状況',r.pricing_review_result||'今回の重点再確認対象外'],['必須機器等の月額',yen(required)+' / 月'],['プロバイダー料金',r.provider_fee_included==='false'?'別契約・別料金':`込み（${r.provider}）`],
  ['契約事務手数料',yen(num(r.initial_fee))],['標準工事費（割引前）',yen(num(r.construction_fee))],['その他必須の初期費用',yen(num(r.mandatory_one_time_fee))],
  ['契約期間',num(r.contract_period)===null?'要確認':num(r.contract_period)===0?'縛りなし':`${num(r.contract_period)}か月`],['解約費用',yen(num(r.cancellation_fee))+'（工事残債等は別）'],['IPv6',r.ipv6||'要確認'],['IPv6等の任意追加料金',num(r.ipv6_option_monthly_fee)===null?'要確認':yen(num(r.ipv6_option_monthly_fee))+' / 月'],
  ['割引前の2年費用目安',yen(total24(r))],['期間別料金',r.monthly_fee_schedule||'定額・今回未確認'],
  ['スマホ割',r.smartphone_discount||'要確認'],['割引の必要オプション',yen(num(r.discount_required_option_fee))+' / 月'],['提供地域',r.service_area],
  ['最大速度 下り / 上り',`${speed(r.max_down_mbps)} / ${speed(r.max_up_mbps)}`],['上り仕様の確認',r.max_up_review_status==='verified'?`公式確認 ${r.max_up_checked_at}`:r.max_up_review_status==='rechecked_unresolved'?`再調査済み・数値未確定 ${r.max_up_checked_at}`:'既存データ'],['上り仕様の注記',r.max_up_notes||'要確認'],['実測の下り / 上り',`${speed(r.measured_down_mbps)} / ${speed(r.measured_up_mbps)}`],['Ping / ジッター / ロス',r.latency_ms===null?'全項目 要確認':`${r.latency_ms}ms / ${r.jitter_ms??'要確認'}ms / ${r.packet_loss_pct??'要確認'}%`],
  ['回線方式',`${r.network_type} / ${r.access_medium}`],['混雑時の制御',r.congestion_policy||'要確認'],['新規受付状態',r.status==='active'?'現行候補として登録・申込時に公式で再確認':'要確認']
 ];
 const sources=[...new Set([...(r.source_url||'').split('|'),...(r.price_source_url||'').split('|'),...(r.technical_source_url||'').split('|'),...(r.max_up_source_url||'').split('|')])].filter(u=>/^https:\/\//.test(u));
 const financial=e.discount.confirmed?`<p class="detail-note">スマホ割の上限試算：${yen(e.discount.amount)}/月、必要オプション${yen(num(r.discount_required_option_fee))}/月。対象プラン・申請条件の確認が必要です。回線料金そのものの値引きとは限りません。</p>`:'';
 return `<tr class="detail-row" id="detail-${r.record_id}"><td colspan="${columns}"><h3 class="detail-header">${esc(r.service_name)} · ${esc(r.plan_name)}</h3><dl class="detail-grid">${entries.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>${financial}<p class="detail-note">割引前の2年費用目安＝通常基本料・必須月額×24＋事務手数料＋標準工事費全額＋確認済み必須初期費用。キャンペーン・スマホ割・キャッシュバックは控除しません。実際の24か月間の請求額や24か月解約時の総額ではありません。初月日割・年次料金変更・任意機器購入・追加工事・ユニバーサル料・撤去費・解約金などは含みません。未確認項目があれば「要確認」です。</p><p class="detail-note">${esc(r.fee_basis)} ${esc(r.notes||'')} ${esc(r.other_fees)}</p><details class="detail-note"><summary>キャンペーン・キャッシュバック（任意）</summary><p>通常料金の比較・順位には含めていません。</p><p>キャンペーン：${esc(r.campaign_summary||'要確認')} ${r.campaign_end?`終了日 ${esc(r.campaign_end)}`:''}</p><p>キャンペーン月額：${yen(num(r.campaign_monthly_fee))} ／ キャッシュバック：${yen(num(r.cashback_amount))}</p></details><p class="detail-note">用途の目安は公称速度の仕様で判定しています。実測速度・遅延・ジッター・パケットロスは、この住まいで測定しないと確認できません。</p><div class="detail-sources">${sources.map((u,i)=>`<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">公式情報源 ${i+1}</a>`).join('')}<span>確認日 ${esc(r.checked_at)}</span></div></td></tr>`;
}
function links(r){
 const hasPR=r.affiliate_available==='true'&&/^https:\/\//.test(r.affiliate_url||'')&&r.link_is_pr==='true';
 const apply=hasPR?r.affiliate_url:r.official_url;
 return `<div class="action-links"><a class="area-link" href="${esc(r.area_check_url)}" target="_blank" rel="noopener noreferrer">公式エリア確認</a><a class="apply-link" href="${esc(apply)}" target="_blank" rel="noopener noreferrer${hasPR?' sponsored':''}">${hasPR?'申込（PR）':'公式で申込'}</a></div>`;
}
function rowHTML(e,i){
 const r=e.row,d=e.discount,expand=opened.has(r.record_id);
 const best=i===0&&category==='fixed'&&e.tier===0;
 const badge=e.insufficient?'仕様上は不足':e.tier===1?'一部要確認':e.overkill?'過剰になりやすい':e.unresolved?'下りの仕様は十分':'仕様上は十分';
 const phone=d.matches?'対象条件あり':input.carrier==='なし'?'未指定':(r.smartphone_carrier?'選択キャリア対象外':'要確認');
 const feeNote=[num(r.mandatory_monthly_fee)>0?`基本 ${yen(num(r.normal_monthly_fee))} ＋ 必須 ${yen(num(r.mandatory_monthly_fee))}`:'',r.monthly_fee_schedule?'期間別料金あり・詳細を確認':'',total24(r)===null?'初期費用・2年総額は要確認':''].filter(Boolean).join(' ／ ');
 const discountView=d.confirmed?`<span class="discount-tag">上限 ${yen(d.amount)}/月</span><div class="fee-sub">必要OP ${yen(num(r.discount_required_option_fee))}/月<br>対象条件を要確認</div>`:`<span class="${d.matches?'discount-tag':'discount-unknown'}">${esc(phone)}</span>`;
 const verdict=category==='wireless'?'電波・端末代を確認':e.verdict;
 return `<tr class="${best?'best':''}" data-record="${r.record_id}"><td><div class="name-line"><span class="rank-number">${category==='fixed'?i+1:'·'}</span><button class="service-name" data-detail="${r.record_id}" aria-expanded="${expand}" aria-controls="detail-${r.record_id}">${esc(r.service_name)}</button></div>${best?'<p class="best-label">この条件で最初に確認</p>':''}<p class="plan">${esc(r.plan_name)}<br><span class="secondary">${num(r.contract_period)===null?'契約期間 未確認':num(r.contract_period)===0?'定期契約なし':`定期契約 ${num(r.contract_period)}か月`}</span><br><span class="area">${esc(r.service_area)}${input.prefecture&&!r.area_prefectures?'（都道府県の対応は公式で確認）':''}</span><br><button class="detail-link" data-detail="${r.record_id}" aria-expanded="${expand}">${expand?'詳細を閉じる':'料金・条件の詳細'}</button></p></td><td><div class="fee">${yen(e.monthly)}<small> /月</small></div>${feeNote?`<div class="fee-sub">${esc(feeNote)}</div>`:''}${num(r.ipv6_option_monthly_fee)!==null?`<div class="fee-sub">IPv6任意OP +${yen(num(r.ipv6_option_monthly_fee))}/月</div>`:''}${d.confirmed?`<div class="fee-sub">家計への割引上限を考慮<br>${yen(e.monthly-d.net)} / 月相当</div>`:''}<div class="fee-sub">${num(r.initial_fee)===null||num(r.construction_fee)===null?'初期・工事費は要確認':'初期・工事費は詳細へ'}</div></td><td><div class="speed"><small>下り</small> ${speed(r.max_down_mbps)}</div><span class="secondary">上り ${num(r.max_up_mbps)===null?'未確認':speed(r.max_up_mbps)}</span></td><td>${discountView}</td><td>${category==='fixed'?`<span class="suitability ${e.insufficient||e.overkill||e.tier===1?'caution':''}">${badge}</span>`:'<span class="suitability caution">光と別に検討</span>'}<span class="verdict">${esc(verdict)}</span>${category==='fixed'&&input.game>0?'<span class="secondary">Ping等は要確認</span>':''}</td><td>${links(r)}</td></tr>${expand?detailHTML(e):''}`;
}
function renderSpeedFilter(){
 const fixed=rows.filter(r=>r.category==='fixed'&&!['excluded','ended','new_sales_ended'].includes(r.status));
 const speeds=[...new Set(fixed.map(r=>num(r.max_down_mbps)).filter(v=>v!==null&&v>=1000))].sort((a,b)=>a-b);
 const choices=[['all','すべて'],...(fixed.some(r=>num(r.max_down_mbps)!==null&&num(r.max_down_mbps)<1000)?[['under1g','1G未満']]:[]),...speeds.map(v=>[String(v),`${v/1000}G`]),...(fixed.some(r=>num(r.max_down_mbps)===null)?[['unknown','速度未確認']]:[])];
 $('#speed-filter').classList.toggle('hidden',category!=='fixed');
 $('#speed-options').innerHTML=choices.map(([v,label])=>`<button type="button" class="option ${input.downSpeed===v?'selected':''}" data-speed="${v}" aria-pressed="${input.downSpeed===v}">${label}</button>`).join('');
}
function renderResults(){
 renderSpeedFilter();
 if(!rows.length||!rules)return;
 const result=rank(rows,input,rules,category),{need}=result;
 // Wireless is a separate, unordered comparison, never a cross-category recommendation.
 if(category==='wireless')result.eligible.sort((a,b)=>a.row.service_name.localeCompare(b.row.service_name,'ja'));
 $('#recommendation').innerHTML='';$('#recommendation').classList.add('hidden');
 const unique=new Set([...result.eligible,...result.pending].map(e=>e.row.service_id)).size;
 $('#result-title').textContent=category==='fixed'?'あなたの条件の比較結果':'ホームルーターの比較';
 $('#count').textContent=`${housingLabel()}${input.prefecture?' · '+input.prefecture:''} · ${unique}サービス / ${result.eligible.length+result.pending.length}プラン　${result.pending.length}件は要確認`;
 $('#usage-summary').textContent=`${input.people===5?'5人以上':input.people+'人'}・${input.connection===1?'有線LAN':'Wi-Fi等'}`;
 $('#compare-note').textContent=(input.contractFilter==='none'?'定期契約なしと確認できたプランだけ表示。契約期間未確認の候補は除外しています。工事費残債等は詳細で確認。 ':'')+(category==='fixed'?'通常料金で比較。キャンペーン・キャッシュバックは順位に含めません。工事・初期費用は未確認項目があります。最大速度は技術規格、用途適合は設計上の目安です。':'通常基本料金を比較しています。端末代は別途。キャンペーン・スマホ割は通常料金に含めません。');
 $('#ranked-body').innerHTML=result.eligible.map(rowHTML).join('');
 $('#empty').classList.toggle('hidden',result.eligible.length!==0);
 $('#empty').textContent='この条件で料金を比較できる候補がありません。下の確認用一覧から、公式の料金・提供条件を確認してください。';
 $('#table-container').classList.toggle('hidden',result.eligible.length===0);
 $('#pending-count').textContent=`${result.pending.length}プラン`;
 $('#pending').classList.toggle('hidden',result.pending.length===0);
 $('#pending-body').innerHTML=result.pending.map(e=>{const r=e.row;const problems=pendingReasons(r,input);return `<tr><td><button class="service-name" data-detail="${r.record_id}" aria-expanded="${opened.has(r.record_id)}">${esc(r.service_name)}</button><p class="secondary">${esc(r.plan_name)}<br>${esc(r.service_area)}</p></td><td>${num(r.normal_monthly_fee)!==null?`${yen(num(r.normal_monthly_fee))}（基本料）`:'要確認'}${num(r.monthly_fee_min)!==null?`<p class="secondary">変動幅 ${yen(num(r.monthly_fee_min))}〜${yen(num(r.monthly_fee_max))}</p>`:''}</td><td>${esc(problems.join(' / ')||'料金条件')}<br><button class="detail-link" data-detail="${r.record_id}">${opened.has(r.record_id)?'詳細を閉じる':'詳細を開く'}</button></td><td>${links(r)}</td></tr>${opened.has(r.record_id)?detailHTML(e,4):''}`;}).join('');
 const latest=[...new Set(rows.map(r=>r.checked_at).filter(Boolean))].sort().at(-1);if(latest)$('.data-footer strong').textContent=latest.replaceAll('-','.');
  const currentRows=rows.filter(r=>!['excluded','ended','new_sales_ended'].includes(r.status));
  $('#coverage').textContent=`全${new Set(currentRows.map(r=>r.service_id)).size}サービス・${currentRows.length}プラン。条件で変わる料金は詳細で確認できます。`;
}
function showDialog(){
 const dialog=$('#info-dialog');
 $('#dialog-title').textContent='選び方の基準';
  const n=requirements(input,rules);
  $('#dialog-content').innerHTML=`<span class="tag">同じ条件には、同じ結果</span><p>用途の推奨帯域に同時利用と余裕を加え、公称速度の仕様を比較します。実測速度を推定する診断ではありません。</p><table><thead><tr><th>利用</th><th>計算の基準</th></tr></thead><tbody><tr><td>Teams・Zoom等</td><td>下り4 / 上り4 Mbps</td></tr><tr><td>画面共有が多い</td><td>会議＋画面共有で下り8 / 上り8 Mbps</td></tr><tr><td>4K動画</td><td>1台あたり下り15 Mbps</td></tr><tr><td>1080p60配信</td><td>上り12 Mbps</td></tr><tr><td>クラウドゲーム</td><td>下り45 / 上り5 Mbps</td></tr><tr><td>大容量ファイル</td><td>上下200 Mbps × 同時作業人数（独自の作業時間目安）</td></tr></tbody></table><p>同時作業人数＝利用人数×0.6を切り上げ、最低1人。5人以上は下限の5人で計算する目安です。複数台視聴は人数分。端末の背景通信（下り2/5/10/20 Mbps）を加え、上下2倍の余裕を確保します。</p><p>現在の必要帯域目安は下り${n.down}・上り${n.up} Mbps。公称値にはさらに4倍の設計余裕を置き、下り${n.targetDown}・上り${n.targetUp} Mbpsを仕様比較の基準にします。余裕係数や背景通信量は独自仮定で、実測値ではありません。</p><h3>順位の決め方</h3><p>①仕様上の帯域不足、上り仕様の未確認を区別。②必要仕様を満たすグループで通常月額を比較。③不要な5G/10Gは用途点18点・比較コスト1,200円相当を減点。混雑時制御があるプランは安定性が必要な用途で同じ減点。</p><p>専用帯域が公式に明記された回線は、ゲーム用途で用途点4点・比較コスト250円相当を加点します。実測で低遅延が確認されたという意味ではありません。速度優先かつ大容量用途のみ、速度に応じ最大700円相当を加点します。</p><p>初期費用の全項目が確認できた場合だけ割引前の2年費用目安を表示し、比較コストが同額で両方のモデルが確認できる場合に総額を比較します。安定性が必要な用途では確認済みIPv6任意オプション料金も比較コストに加算します。スマホ割の上限試算は対象回線数を本人が指定した場合のみ、確認できた割引額から必要オプション料金を差し引いて比較します。対象スマホプランの確定には公式確認が必要です。</p><p>FPS・格闘ゲームでは公称速度をPingへ変換せず、有線LANと実測確認を優先。独自のゲーム遅延目標30ms、クラウドゲーム80msを参考にしていますが、掲載サービスの達成は未確認です。ジッター・ロス・安定性が重要な条件でも、未測定の品質順位は作りません。</p><h3>推奨帯域の参考</h3><ul>${rules.sources.map(s=>`<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.label)}</a></li>`).join('')}</ul><p class="small">ルール版 ${rules.version} · <a href="rules.json" target="_blank">数値ルールを見る</a>。順位計算と商品CSVは分離しています。</p>`;
 dialog.showModal();
}
document.addEventListener('click',event=>{
 const speedChoice=event.target.closest('[data-speed]');if(speedChoice){input.downSpeed=speedChoice.dataset.speed;opened.clear();renderResults();return;}
 const option=event.target.closest('[data-field]');if(option){choose(option);return;}
 const detail=event.target.closest('[data-detail]');if(detail){const id=detail.dataset.detail;if(opened.has(id))opened.delete(id);else opened.add(id);renderResults();const replacement=document.querySelector(`button[data-detail="${id}"]`);replacement?.focus({preventScroll:true});}
});
$('#reset').addEventListener('click',()=>{input={...defaults};opened.clear();renderFields();renderResults();});
function setCategory(next){category=next;opened.clear();for(const name of ['fixed','wireless']){const selected=name===next;const button=$(`#${name}-tab`);button.classList.toggle('active',selected);button.setAttribute('aria-selected',selected);}$('#comparison-panel').setAttribute('aria-labelledby',`${next}-tab`);renderResults();}
$('#fixed-tab').addEventListener('click',()=>setCategory('fixed'));$('#wireless-tab').addEventListener('click',()=>setCategory('wireless'));
$('.tabbar').addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?'fixed':e.key==='End'?'wireless':category==='fixed'?'wireless':'fixed';setCategory(next);$(`#${next}-tab`).focus();}});
$('#method-button').addEventListener('click',()=>showDialog());$('#close-dialog').addEventListener('click',()=>$('#info-dialog').close());
$('#info-dialog').addEventListener('click',e=>{if(e.target===$('#info-dialog')){const rect=e.target.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)e.target.close();}});
renderFields();if(matchMedia('(max-width:760px)').matches)$('.use-details').open=false;
async function load(){
 try{
  const responses=await Promise.all([fetch('data/plans.csv',{cache:'no-store'}),fetch('rules.json',{cache:'no-store'})]);
  if(responses.some(r=>!r.ok))throw new Error('料金情報を取得できません');
  $('#recommendation').classList.add('hidden');rows=validateRows(parseCSV(await responses[0].text()));$('#catalog-summary').textContent=`${rows.filter(r=>!['excluded','ended','new_sales_ended'].includes(r.status)).length}プラン掲載`;rules=await responses[1].json();$('#method-button').disabled=false;renderResults();
 }catch(e){$('#recommendation').classList.remove('hidden');$('#recommendation').innerHTML=`<div class="error"><p>料金情報を読み込めませんでした。候補の表示を停止しています。</p><button id="retry">再読み込み</button><p class="small">${esc(e.message)}</p></div>`;$('#retry').onclick=load;$('#method-button').disabled=true;}
}
load();
