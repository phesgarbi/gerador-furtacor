// GERADOR FURTA-COR · painel, render e export
(() => {
'use strict';
const $ = id => document.getElementById(id);
const ONLINE = !!window.ONLINE;                      // versão publicada: sem servidor, sem export de vídeo
document.body.classList.toggle('online', ONLINE);
const LOOKS = { 1: 'FURTACOR', 2: 'MACIO', 3: 'BLOCOS', 4: 'LIQUIDO', 5: 'LINHAS', 8: 'TECIDO' };
// efeitos da pilha: n = código no shader, p = [nome, mínimo, máximo, padrão, passo]
const FX = {
  vidro: { n: 1, nome: 'VIDRO', modos: ['quadriculado', 'canelado'], p: [['Tamanho', 0.02, 0.5, 0.09, 0.005], ['Força', 0, 1, 0.45, 0.01]] },
  mosaico: { n: 2, nome: 'MOSAICO', fundo: true, p: [['Tamanho', 0.25, 4, 1, 0.01], ['Tempo aceso', 0.1, 1, 0.62, 0.01], ['Dureza', 0, 1, 0.6, 0.01]] },
  linhas: { n: 3, nome: 'LINHAS', fundo: true, modos: ['curvas de nível', 'moiré de dois centros', 'verticais ondulando'],
    p: [['Densidade', 2, 40, 14, 0.5], ['Espessura', 0.1, 0.9, 0.5, 0.01], ['Dureza', 0, 1, 0.7, 0.01], ['Escala', 0.25, 4, 1, 0.01]] },
  blocos: { n: 4, nome: 'BLOCOS / DEGRAUS', modos: ['colunas', 'linhas'], p: [['Largura', 0.03, 1.5, 0.3, 0.005], ['Deslocamento', 0, 1, 0.35, 0.01], ['Degraus', 0, 1, 0.5, 0.01]] },
  grao: { n: 5, nome: 'GRÃO', p: [['Quantidade', 0, 1, 0.15, 0.01], ['Tamanho', 1, 6, 1, 1]] },
};
const novoFx = (tipo, extra) => Object.assign({ tipo, on: true, modo: 0, fundo: 0, p: FX[tipo].p.map(d => d[3]) }, extra || {});
const FORMAS = {
  1: ['manchas'], 2: ['manchas', 'faixas onduladas', 'radial do centro'],
  3: ['colunas', 'linhas', 'grade'], 4: ['poucos contornos', 'médio', 'muitos contornos'],
  5: ['curvas de nível', 'moiré de dois centros', 'verticais ondulando'], 8: ['tecido'],
};
const COM_ALFA = [1, 4, 5];
const PADRAO = {
  tam: '2304x256', w: 2304, h: 256, look: 1, forma: 0, fx: [novoFx('grao')],
  seed: 7, vel: 2, esc: 1, dur: 0.6, contr: 0, loop: 30, alfa: false,
  pal: ['#c3c8d2', '#f0284a', '#f29a1e', '#1cf512', '#15e6a8', '#2f48e0'], palNome: 'FURTA-COR PLACA',
  logoTam: 1.6, logoRep: 1, logo: '', guias: true, real: false, numero: 1, teste: false,
};
// receitas antigas (vidro, grão e mosaico como controles soltos) viram pilha
function migra(o) {
  o = JSON.parse(JSON.stringify(o));
  if (!Array.isArray(o.fx)) {
    o.fx = [];
    if (o.look === 7) { o.look = o.fonte || 2; o.fx.push(novoFx('mosaico', { p: [o.esc || 1, 0.62, o.dur === undefined ? 0.6 : o.dur] })); o.esc = 1; }
    if (o.vidro) o.fx.push(novoFx('vidro', { modo: o.vidro - 1, p: [o.vidroTam || 0.09, o.vidroForca === undefined ? 0.45 : o.vidroForca] }));
    if (o.grao === undefined || o.grao > 0) o.fx.push(novoFx('grao', { p: [o.grao === undefined ? 0.15 : o.grao, 1] }));
  }
  o.fx = o.fx.filter(f => FX[f.tipo]);
  ['fonte', 'vidro', 'vidroTam', 'vidroForca', 'grao'].forEach(k => delete o[k]);
  return o;
}
let S = migra(PADRAO);
try { const g = localStorage.getItem('gerador_furtacor'); if (g) S = migra(Object.assign({}, PADRAO, { fx: undefined }, JSON.parse(g))); } catch (e) {}
// histórico para Voltar / Refazer
let hist = [], fut = [], ultimo = JSON.stringify(S), relogio = 0;
function fixa() { clearTimeout(relogio); relogio = 0; const a = JSON.stringify(S); if (a !== ultimo) { hist.push(ultimo); if (hist.length > 200) hist.shift(); ultimo = a; fut = []; } botoesHist(); }
function botoesHist() { const v = document.getElementById('voltar'); if (v) { v.disabled = !hist.length; document.getElementById('refazer').disabled = !fut.length; } }
const guarda = () => { try { localStorage.setItem('gerador_furtacor', JSON.stringify(S)); } catch (e) {} clearTimeout(relogio); relogio = setTimeout(fixa, 350); };

// ---------- WebGL ----------
const glc = document.createElement('canvas');
const gl = glc.getContext('webgl2', { alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false });
const comp = document.createElement('canvas');           // usado só quando a largura passa do limite da placa
const ctx2 = comp.getContext('2d');
if (!gl) { $('status').textContent = 'Este navegador não tem WebGL2. Abra no Chrome.'; return; }
const q = new URLSearchParams(location.search);
const LIMITE = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
  gl.getParameter(gl.MAX_VIEWPORT_DIMS)[0], +(q.get('faixa') || 1e9));
function sh(tipo, src) {
  const s = gl.createShader(tipo); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
const prog = gl.createProgram();
try {
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
} catch (e) { $('status').textContent = 'Erro no shader: ' + e.message; console.error(e); return; }
gl.useProgram(prog);
const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
const la = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(la); gl.vertexAttribPointer(la, 2, gl.FLOAT, false, 0, 0);
const U = n => gl.getUniformLocation(prog, n);
const logoTex = gl.createTexture(); let logoAsp = 1, temLogo = 0;
gl.bindTexture(gl.TEXTURE_2D, logoTex);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));

let faixas = false, larguraFaixa = 0;
function ajustaTela() {
  faixas = S.w > LIMITE;
  larguraFaixa = faixas ? LIMITE : S.w;
  glc.width = larguraFaixa; glc.height = S.h;
  if (!faixas && gl.drawingBufferWidth !== S.w) { faixas = true; larguraFaixa = gl.drawingBufferWidth; }
  if (faixas) { comp.width = S.w; comp.height = S.h; }
  const m = $('moldura'); const ativo = faixas ? comp : glc;
  if (m.firstChild !== ativo) { m.querySelectorAll('canvas').forEach(c => c.remove()); m.prepend(ativo); }
  desenhaGuias();
  requestAnimationFrame(() => { const p = $('palco'); p.scrollLeft = (p.scrollWidth - p.clientWidth) / 2; });   // no celular a faixa rola: começa pelo meio
}
const lin = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => Math.pow(v / 255, 2.2)); };
function desenhar(fase, frame) {
  const pal = new Float32Array(24); S.pal.slice(0, 8).forEach((h, i) => pal.set(lin(h), i * 3));
  gl.uniform2f(U('uRes'), S.w, S.h); gl.uniform1f(U('uFase'), fase);
  gl.uniform1i(U('uLook'), S.look); gl.uniform1i(U('uForma'), S.forma);
  gl.uniform1i(U('uN'), Math.max(1, Math.min(8, S.pal.length)));
  gl.uniform1i(U('uSeed'), S.seed); gl.uniform1i(U('uFrame'), frame | 0); gl.uniform1i(U('uVel'), S.vel);
  gl.uniform1i(U('uAlfa'), S.alfa ? 1 : 0); gl.uniform1i(U('uTemLogo'), temLogo);
  gl.uniform1f(U('uEsc'), S.esc); gl.uniform1f(U('uDur'), S.dur); gl.uniform1f(U('uContr'), S.contr);
  const lig = S.fx.filter(f => f.on).slice(0, 6), ft = new Int32Array(6), fm = new Int32Array(6), fp = new Float32Array(24);
  lig.forEach((f, i) => { ft[i] = FX[f.tipo].n; fm[i] = (f.modo | 0) + 10 * (f.fundo | 0); fp.set(f.p.slice(0, 4), i * 4); });
  gl.uniform1i(U('uNF'), lig.length); gl.uniform1iv(U('uFT[0]'), ft); gl.uniform1iv(U('uFM[0]'), fm); gl.uniform4fv(U('uFP[0]'), fp);
  gl.uniform1f(U('uLogoAsp'), logoAsp); gl.uniform1f(U('uLogoTam'), S.logoTam); gl.uniform1f(U('uLogoRep'), S.logoRep);
  gl.uniform3fv(U('uPal[0]'), pal);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, logoTex); gl.uniform1i(U('uLogo'), 0);
  gl.viewport(0, 0, glc.width, glc.height);
  if (!faixas) { gl.uniform2f(U('uOff'), 0, 0); gl.drawArrays(gl.TRIANGLES, 0, 3); return; }
  ctx2.globalCompositeOperation = 'copy';
  for (let x = 0; x < S.w; x += larguraFaixa) {
    gl.uniform2f(U('uOff'), x, 0); gl.drawArrays(gl.TRIANGLES, 0, 3);
    const lw = Math.min(larguraFaixa, S.w - x);
    ctx2.save(); ctx2.beginPath(); ctx2.rect(x, 0, lw, S.h); ctx2.clip();
    ctx2.drawImage(glc, 0, 0, lw, S.h, x, 0, lw, S.h); ctx2.restore();
  }
}
const saida = () => (faixas ? comp : glc);
const png = () => new Promise(r => saida().toBlob(r, 'image/png'));

// ---------- laço do preview ----------
let exportando = false, t0 = performance.now(), faseAtual = 0;
function quadro(agora) {
  if (!exportando) {
    if (!S.pausa) faseAtual = (((agora - t0) / 1000) % S.loop) / S.loop;
    desenhar(faseAtual, Math.floor(faseAtual * S.loop * 60));
  }
  requestAnimationFrame(quadro);
}

// ---------- guias ----------
function desenhaGuias() {
  const m = $('moldura'); m.querySelectorAll('.guia').forEach(g => g.remove());
  if (!S.guias) return;
  const xs = S.w === 7168 ? [2304, 3584, 4864] : (S.w === 1024 ? [512] : []);
  xs.forEach(x => { const d = document.createElement('div'); d.className = 'guia'; d.style.left = (x / S.w * 100) + '%'; m.append(d); });
}

// ---------- painel ----------
const CAMPOS = ['seed', 'vel', 'esc', 'dur', 'contr', 'logoTam', 'logoRep'];
function pinta() {
  $('tam').value = S.tam; $('lw').value = S.w; $('lh').value = S.h;
  $('livreBox').style.display = S.tam === 'livre' ? 'flex' : 'none';
  $('look').value = S.look;
  const fs = FORMAS[S.look] || ['padrão']; if (S.forma >= fs.length) S.forma = 0;
  $('forma').innerHTML = fs.map((n, i) => `<option value="${i}">${n}</option>`).join(''); $('forma').value = S.forma;
  $('formaBox').style.display = fs.length > 1 ? 'grid' : 'none';
  $('logoBox').style.display = S.look === 8 ? 'block' : 'none';
  CAMPOS.forEach(k => { const e = $(k); e.value = S[k]; e.parentElement.querySelector('.v').textContent = (+S[k]).toFixed(e.step < 1 ? 2 : 0); });
  $('loop').value = S.loop; $('numero').value = S.numero; $('teste').checked = S.teste;
  const pode = COM_ALFA.includes(S.look) || S.fx.some(f => f.on && FX[f.tipo].fundo);
  $('alfa').disabled = !pode; if (!pode) S.alfa = false; $('alfa').checked = S.alfa;
  $('alfaDica').textContent = pode ? '' : 'este look sozinho não tem versão transparente (com MOSAICO ou LINHAS na pilha passa a ter)';
  $('guias').checked = S.guias; $('real').checked = S.real; $('pausa').checked = !!S.pausa;
  $('palco').classList.toggle('real', S.real);
  const n = Math.round(S.loop * 60);
  $('info').textContent = `${S.w}×${S.h} · loop ${S.loop} s · ${n} frames` + (faixas ? ` · render em faixas de ${larguraFaixa} px` : '');
  $('nomeSaida').textContent = 'Sai como: ' + (S.teste ? 'TESTE · ' : '') + nomeSaida() + '.mov';
  pintaCores(); pintaFx(); guarda();
}
const nomeSaida = () => `MOMO_${LOOKS[S.look]}${String(S.numero).padStart(2, '0')}_${S.alfa ? 'P2' : 'P3'}_${S.w}x${S.h}`;
function muda(k, v) { S[k] = v; if (k === 'w' || k === 'h' || k === 'tam') ajustaTela(); pinta(); }
CAMPOS.forEach(k => $(k).addEventListener('input', e => muda(k, +e.target.value)));
['look', 'forma'].forEach(k => $(k).addEventListener('change', e => { muda(k, +e.target.value); if (k === 'look') pedeNumero(); }));
$('tam').addEventListener('change', e => {
  S.tam = e.target.value;
  if (S.tam !== 'livre') { const [w, h] = S.tam.split('x').map(Number); S.w = w; S.h = h; }
  ajustaTela(); pinta();
});
const m4 = v => Math.max(4, Math.round(v / 4) * 4);
$('lw').addEventListener('change', e => muda('w', m4(+e.target.value)));
$('lh').addEventListener('change', e => muda('h', m4(+e.target.value)));
$('loop').addEventListener('change', e => muda('loop', Math.max(1, Math.min(120, +e.target.value || 30))));
$('numero').addEventListener('change', e => muda('numero', Math.max(1, Math.min(99, +e.target.value || 1))));
['alfa', 'teste', 'guias', 'real', 'pausa'].forEach(k => $(k).addEventListener('change', e => { muda(k, e.target.checked); if (k === 'guias') desenhaGuias(); }));
$('sorteia').onclick = () => muda('seed', 1 + Math.floor(Math.random() * 999));

// ---------- pilha de efeitos ----------
function pintaFx() {
  const c = $('fxLista'); c.innerHTML = '';
  if (!S.fx.length) c.innerHTML = '<p class="dica">Nenhum efeito. Escolha um acima e clique em Adicionar.</p>';
  for (let i = S.fx.length - 1; i >= 0; i--) {             // o último da pilha aparece em cima
    const f = S.fx[i], d = FX[f.tipo], el = document.createElement('div'); el.className = 'fx' + (f.on ? '' : ' off');
    let h = `<div class="cab"><input type="checkbox" ${f.on ? 'checked' : ''} title="ligar / desligar"><b>${d.nome}</b>
      <button title="subir">↑</button><button title="descer">↓</button><button title="remover">×</button></div>`;
    if (d.modos) h += `<label class="l">Tipo<select data-k="modo">${d.modos.map((m, j) => `<option value="${j}">${m}</option>`).join('')}</select><span></span></label>`;
    if (d.fundo) h += `<label class="l">Onde apaga<select data-k="fundo"><option value="0">preto</option><option value="1">1ª cor da paleta</option></select><span></span></label>`;
    d.p.forEach((q, j) => { h += `<label class="l">${q[0]}<input type="range" data-p="${j}" min="${q[1]}" max="${q[2]}" step="${q[4]}"><span class="v"></span></label>`; });
    el.innerHTML = h;
    const [sobe, desce, tira] = el.querySelectorAll('.cab button');
    el.querySelector('.cab input').onchange = e => { f.on = e.target.checked; pinta(); };
    sobe.onclick = () => { if (i < S.fx.length - 1) { [S.fx[i + 1], S.fx[i]] = [S.fx[i], S.fx[i + 1]]; pinta(); } };
    desce.onclick = () => { if (i > 0) { [S.fx[i - 1], S.fx[i]] = [S.fx[i], S.fx[i - 1]]; pinta(); } };
    tira.onclick = () => { S.fx.splice(i, 1); pinta(); };
    el.querySelectorAll('select').forEach(sel => { sel.value = f[sel.dataset.k] | 0; sel.onchange = () => { f[sel.dataset.k] = +sel.value; pinta(); }; });
    el.querySelectorAll('input[type=range]').forEach(r => {
      const j = +r.dataset.p, v = r.parentElement.querySelector('.v'), mostra = () => { v.textContent = (+f.p[j]).toFixed(d.p[j][4] < 1 ? 2 : 0); };
      r.value = f.p[j]; mostra(); r.oninput = () => { f.p[j] = +r.value; mostra(); guarda(); };   // sem redesenhar o painel: o arrasto não trava
    });
    c.append(el);
  }
  $('fxMais').disabled = S.fx.length >= 12;
}
$('fxMais').onclick = () => { S.fx.push(novoFx($('fxTipo').value)); pinta(); };

// ---------- voltar / refazer ----------
async function repoe(txt) {
  const logoAntes = S.logo; S = JSON.parse(txt); ultimo = txt;
  ajustaTela(); pinta(); listaPaletas(); clearTimeout(relogio); relogio = 0; botoesHist();
  try { localStorage.setItem('gerador_furtacor', txt); } catch (e) {}
  if (S.logo !== logoAntes && S.logo) { $('logoSel').value = S.logo; await logoDaLista(S.logo); }
}
function voltar() { fixa(); if (!hist.length || exportando) return; fut.push(ultimo); return repoe(hist.pop()); }
function refazer() { fixa(); if (!fut.length || exportando) return; hist.push(ultimo); return repoe(fut.pop()); }
$('voltar').onclick = voltar; $('refazer').onclick = refazer;
window.addEventListener('keydown', e => {
  if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
  const t = e.target; if (t && t.tagName === 'INPUT' && t.type === 'text' && document.activeElement === t) return;  // digitando texto: vale o desfazer do campo
  e.preventDefault(); if (e.shiftKey) refazer(); else voltar();
});

// ---------- paletas ----------
let salvas = [];
// na versão online o que seria do servidor fica no próprio navegador
async function apiOnline(u, corpo) {
  const ler = () => { try { return JSON.parse(localStorage.getItem('gerador_paletas') || '[]'); } catch (e) { return []; } };
  const grava = l => { try { localStorage.setItem('gerador_paletas', JSON.stringify(l)); } catch (e) {} return l; };
  const p = u.split('?')[0];
  if (p === '/api/paletas') return corpo ? grava(ler().filter(x => x.nome !== corpo.nome).concat([{ nome: corpo.nome, cores: corpo.cores }])) : ler();
  if (p === '/api/paletas/apagar') return grava(ler().filter(x => x.nome !== corpo.nome));
  if (p === '/api/logos') return window.LOGOS || [];
  if (p === '/api/numero') return { numero: S.numero };
  if (p === '/api/frame') {
    const nome = decodeURIComponent(u.split('nome=')[1] || 'gradiente') + '.png';
    const a = document.createElement('a'); a.href = URL.createObjectURL(corpo); a.download = nome; a.click();
    return { arquivo: nome + ' (baixado)' };
  }
  throw new Error('isso só existe na versão do Mac');
}
const api = (u, corpo) => ONLINE ? apiOnline(u, corpo) : fetch(u, corpo === undefined ? {} : { method: 'POST', body: corpo instanceof Blob ? corpo : JSON.stringify(corpo) }).then(async r => {
  const j = await r.json(); if (!r.ok) throw new Error(j.erro || r.status); return j;
});
function listaPaletas() {
  const o = [`<option value="">(personalizada)</option>`, '<optgroup label="Prontas">']
    .concat(PALETAS_PRONTAS.map(p => `<option>${p.nome}</option>`), ['</optgroup><optgroup label="Salvas">'],
      salvas.map(p => `<option>${p.nome}</option>`), ['</optgroup>']);
  $('pal').innerHTML = o.join(''); $('pal').value = S.palNome || '';
  if ($('pal').value !== (S.palNome || '')) $('pal').value = '';
}
function pintaCores() {
  const c = $('cores'); c.innerHTML = '';
  S.pal.forEach((h, i) => {
    const d = document.createElement('div'); d.className = 'cor';
    d.innerHTML = `<span class="n">${i + 1}</span><input type="color" value="${h}"><input type="text" value="${h}" maxlength="7" spellcheck="false">
      <button title="subir">↑</button><button title="descer">↓</button><button title="remover">×</button>`;
    const [cor, hex] = d.querySelectorAll('input'); const [sobe, desce, tira] = d.querySelectorAll('button');
    cor.oninput = () => { S.pal[i] = cor.value; hex.value = cor.value; S.palNome = ''; $('pal').value = ''; guarda(); };
    hex.onchange = () => {
      let v = hex.value.trim(); if (v[0] !== '#') v = '#' + v;
      if (/^#[0-9a-fA-F]{6}$/.test(v)) { S.pal[i] = v.toLowerCase(); S.palNome = ''; } pinta(); listaPaletas();
    };
    sobe.onclick = () => { if (i > 0) { [S.pal[i - 1], S.pal[i]] = [S.pal[i], S.pal[i - 1]]; S.palNome = ''; pinta(); listaPaletas(); } };
    desce.onclick = () => { if (i < S.pal.length - 1) { [S.pal[i + 1], S.pal[i]] = [S.pal[i], S.pal[i + 1]]; S.palNome = ''; pinta(); listaPaletas(); } };
    tira.onclick = () => { if (S.pal.length > 1) { S.pal.splice(i, 1); S.palNome = ''; pinta(); listaPaletas(); } };
    c.append(d);
  });
  $('maisCor').disabled = S.pal.length >= 8;
}
$('maisCor').onclick = () => { if (S.pal.length < 8) { S.pal.push('#ffffff'); S.palNome = ''; pinta(); listaPaletas(); } };
$('pal').onchange = e => {
  const p = PALETAS_PRONTAS.concat(salvas).find(x => x.nome === e.target.value);
  if (p) { S.pal = p.cores.slice(); S.palNome = p.nome; $('palNome').value = salvas.includes(p) ? p.nome : ''; pinta(); }
};
$('salvaPal').onclick = async () => {
  const nome = $('palNome').value.trim();
  if (!nome) { aviso('Dê um nome para a paleta antes de salvar.'); return; }
  if (PALETAS_PRONTAS.some(p => p.nome === nome)) { aviso('Esse nome é de uma paleta pronta. Use outro.'); return; }
  try { salvas = await api('/api/paletas', { nome, cores: S.pal }); S.palNome = nome; listaPaletas(); guarda(); aviso(`Paleta "${nome}" salva.`); }
  catch (e) { aviso('Não salvou: ' + e.message); }
};
$('apagaPal').onclick = async () => {
  const p = salvas.find(x => x.nome === $('pal').value);
  if (!p) { aviso('Escolha na lista uma paleta salva por você para apagar.'); return; }
  if (!confirm(`Apagar a paleta salva "${p.nome}"?`)) return;
  salvas = await api('/api/paletas/apagar', { nome: p.nome }); S.palNome = ''; listaPaletas(); guarda();
};
// paleta tirada de imagem (k-means sobre a imagem reduzida)
async function paletaDeImagem(arquivo, k) {
  const bmp = await createImageBitmap(arquivo);
  const e = Math.min(1, 96 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(bmp.width * e)); c.height = Math.max(1, Math.round(bmp.height * e));
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(bmp, 0, 0, c.width, c.height);
  const d = x.getImageData(0, 0, c.width, c.height).data; const px = [];
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) px.push([d[i], d[i + 1], d[i + 2]]);
  k = Math.max(5, Math.min(8, k || 6));
  const dist = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  const cen = [px[0]];                                   // início pelo ponto mais distante: determinístico
  while (cen.length < k) { let m = -1, mi = 0; px.forEach((p, i) => { const dd = Math.min(...cen.map(q => dist(p, q))); if (dd > m) { m = dd; mi = i; } }); cen.push(px[mi]); }
  let cont = [];
  for (let it = 0; it < 12; it++) {
    const soma = cen.map(() => [0, 0, 0, 0]);
    px.forEach(p => { let b = 0, bd = 1e12; cen.forEach((q, j) => { const dd = dist(p, q); if (dd < bd) { bd = dd; b = j; } }); const s = soma[b]; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++; });
    soma.forEach((s, j) => { if (s[3]) cen[j] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]; }); cont = soma.map(s => s[3]);
  }
  const hex = v => '#' + v.map(n => Math.round(n).toString(16).padStart(2, '0')).join('');
  S.pal = cen.map((v, i) => [cont[i], hex(v)]).sort((a, b) => b[0] - a[0]).map(v => v[1]);
  S.palNome = ''; $('palNome').value = (arquivo.name || 'imagem').replace(/\.[^.]+$/, '').slice(0, 40);
  pinta(); listaPaletas();
}
const solta = $('solta');
['dragenter', 'dragover'].forEach(ev => solta.addEventListener(ev, e => { e.preventDefault(); solta.classList.add('sobre'); }));
['dragleave', 'drop'].forEach(ev => solta.addEventListener(ev, e => { e.preventDefault(); solta.classList.remove('sobre'); }));
solta.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) paletaDeImagem(f, +$('nCores').value); });
$('imgArq').onchange = e => { if (e.target.files[0]) paletaDeImagem(e.target.files[0], +$('nCores').value); };
$('nCores').onchange = () => { if ($('imgArq').files[0]) paletaDeImagem($('imgArq').files[0], +$('nCores').value); };
window.addEventListener('dragover', e => e.preventDefault()); window.addEventListener('drop', e => e.preventDefault());

// ---------- logo do TECIDO ----------
function desfoca(src, w, h, r, passes) {
  let a = Float32Array.from(src), b = new Float32Array(w * h);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) { let s = 0; const o = y * w;
      for (let x = -r; x <= r; x++) s += a[o + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) { b[o + x] = s / (2 * r + 1); s += a[o + Math.min(w - 1, x + r + 1)] - a[o + Math.max(0, x - r)]; } }
    for (let x = 0; x < w; x++) { let s = 0;
      for (let y = -r; y <= r; y++) s += b[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) { a[y * w + x] = s / (2 * r + 1); s += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x]; } }
  }
  return a;
}
async function carregarLogo(arquivo) {
  const bmp = await createImageBitmap(arquivo);
  const c0 = document.createElement('canvas'); c0.width = bmp.width; c0.height = bmp.height;
  const x0 = c0.getContext('2d', { willReadFrequently: true }); x0.drawImage(bmp, 0, 0);
  const d = x0.getImageData(0, 0, c0.width, c0.height).data; const W = c0.width, H = c0.height;
  const al = new Float32Array(W * H); let temAlfa = false;
  for (let i = 0; i < W * H; i++) if (d[i * 4 + 3] < 250) { temAlfa = true; break; }
  const f = [d[0], d[1], d[2]];                             // sem alfa: a cor do canto é o fundo
  let x1 = W, y1 = H, x2 = 0, y2 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const a = temAlfa ? d[i + 3] / 255 : Math.min(1, (Math.abs(d[i] - f[0]) + Math.abs(d[i + 1] - f[1]) + Math.abs(d[i + 2] - f[2])) / 90);
    al[y * W + x] = a; if (a > 0.1) { if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y; }
  }
  if (x2 <= x1 || y2 <= y1) { aviso('Não achei o logo nessa imagem.'); return; }
  const bw = x2 - x1 + 1, bh = y2 - y1 + 1, LH = 256, e = LH / bh, lw = Math.min(3584, Math.round(bw * e)), pad = LH / 2;
  const tw = lw + 2 * pad, th = LH + 2 * pad;
  const cm = document.createElement('canvas'); cm.width = W; cm.height = H; const xm = cm.getContext('2d');
  const im = xm.createImageData(W, H); for (let i = 0; i < W * H; i++) { im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = 255; im.data[i * 4 + 3] = Math.round(al[i] * 255); } xm.putImageData(im, 0, 0);
  const ct = document.createElement('canvas'); ct.width = tw; ct.height = th; const xt = ct.getContext('2d', { willReadFrequently: true });
  xt.imageSmoothingQuality = 'high'; xt.drawImage(cm, x1, y1, bw, bh, pad, pad, lw, LH);
  const td = xt.getImageData(0, 0, tw, th).data; const base = new Float32Array(tw * th);
  for (let i = 0; i < tw * th; i++) base[i] = td[i * 4 + 3] / 255;
  const med = desfoca(base, tw, th, 10, 3), larg = desfoca(base, tw, th, 34, 3);
  const out = new Uint8Array(tw * th * 4);
  for (let i = 0; i < tw * th; i++) { out[i * 4] = base[i] * 255; out[i * 4 + 1] = med[i] * 255; out[i * 4 + 2] = larg[i] * 255; out[i * 4 + 3] = 255; }
  gl.bindTexture(gl.TEXTURE_2D, logoTex); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, tw, th, 0, gl.RGBA, gl.UNSIGNED_BYTE, out);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  logoAsp = tw / th; temLogo = 1;
}
async function logoDaLista(rel) {
  S.logo = rel; guarda(); if (!rel) { temLogo = 0; return; }
  try { await carregarLogo(await (await fetch(ONLINE ? 'logos/' + rel.split('/').pop() : '/ref/' + rel)).blob()); } catch (e) { aviso('Não abri o logo: ' + e.message); }
}
$('logoSel').onchange = e => logoDaLista(e.target.value);
$('logoArq').onchange = async e => { if (e.target.files[0]) { await carregarLogo(e.target.files[0]); S.logo = ''; $('logoSel').value = ''; guarda(); } };

// ---------- export ----------
const aviso = t => { $('status').textContent = t; };
const barra = f => { $('barra').firstElementChild.style.width = (f * 100).toFixed(1) + '%'; };
let cancelar = false;
const tempo = s => `${Math.floor(s / 60)} min ${String(Math.floor(s % 60)).padStart(2, '0')} s`;
const receita = () => { const r = Object.assign({}, S); delete r.guias; delete r.real; delete r.pausa; return r; };
async function pedeNumero() {
  try { const r = await api('/api/numero?look=' + LOOKS[S.look]); S.numero = r.numero; pinta(); } catch (e) {}
}
async function exportar() {
  if (exportando) return;
  if (S.look === 8 && !temLogo) { aviso('Escolha um logo para o TECIDO antes de exportar.'); return; }
  const N = Math.round(S.loop * 60); let r;
  try {
    r = await api('/api/export/iniciar', { look: LOOKS[S.look], w: S.w, h: S.h, fps: 60, frames: N, alfa: S.alfa, teste: S.teste, numero: S.numero, receita: receita() });
  } catch (e) { aviso('Não começou: ' + e.message); return; }
  exportando = true; cancelar = false; $('exporta').disabled = true; $('cancela').disabled = false;
  const ini = performance.now();
  try {
    for (let i = 0; i < N; i++) {
      if (cancelar) throw new Error('cancelado (os PNG já gravados ficaram em ' + r.seq + ')');
      desenhar(i / N, i);
      const b = await png();
      await api(`/api/export/frame?job=${r.job}&n=${i}`, b);
      if (i % 5 === 0 || i === N - 1) {
        const dec = (performance.now() - ini) / 1000, falta = dec / (i + 1) * (N - i - 1);
        barra((i + 1) / N * 0.9); aviso(`Frames ${i + 1} de ${N} · ${Math.round((i + 1) / N * 100)}% · passou ${tempo(dec)} · falta cerca de ${tempo(falta)}`);
      }
    }
    await api(`/api/export/converter?job=${r.job}`, {});
    let e;
    do { await new Promise(z => setTimeout(z, 600)); e = await api(`/api/export/estado?job=${r.job}`);
      aviso(`Convertendo para .mov (${S.alfa ? 'ProRes 4444' : 'DXV'})... passou ${tempo((performance.now() - ini) / 1000)}`);
    } while (e.estado === 'convertendo' || e.estado === 'recebendo');
    if (e.estado !== 'pronto') throw new Error('conversão falhou: ' + e.log);
    barra(1); aviso(`Pronto em ${tempo((performance.now() - ini) / 1000)}.\n${e.mov}\n${e.preview}`);
    if (!S.teste) pedeNumero();
    return e;
  } catch (e) { aviso('Parou: ' + e.message); throw e; }
  finally { exportando = false; $('exporta').disabled = false; $('cancela').disabled = true; }
}
$('exporta').onclick = () => exportar().catch(() => {});
$('cancela').onclick = () => { cancelar = true; };
async function salvarFrame(nome, fase) {
  const era = exportando; exportando = true;
  try { if (fase === undefined) fase = faseAtual; desenhar(fase, Math.floor(fase * S.loop * 60));
    const r = await api('/api/frame?nome=' + encodeURIComponent(nome || (nomeSaida() + '_frame')), await png()); aviso('Frame salvo:\n' + r.arquivo); return r; }
  finally { exportando = era; }
}
$('frame').onclick = () => salvarFrame().catch(e => aviso('Não salvou: ' + e.message));
document.querySelectorAll('[data-abre]').forEach(b => b.onclick = () => api('/api/abrir', { pasta: b.dataset.abre }));
$('salvaRec').onclick = () => {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(receita(), null, 1)], { type: 'application/json' }));
  a.download = nomeSaida() + '.json'; a.click();
};
async function aplicar(o) {
  S = migra(Object.assign({}, S, o.fx ? {} : (('vidro' in o || 'grao' in o || o.look === 7) ? { fx: undefined } : {}), o)); ajustaTela(); pinta(); listaPaletas();
  if (o.logo !== undefined) await logoDaLista(S.logo);
}
$('abreRec').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try { await aplicar(JSON.parse(await f.text())); $('logoSel').value = S.logo || ''; aviso('Receita aberta: ' + f.name); } catch (er) { aviso('Receita inválida.'); }
};

// ---------- link de gradiente (receita dentro do endereço) ----------
const codifica = o => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const decodifica = t => JSON.parse(decodeURIComponent(escape(atob(t.replace(/-/g, '+').replace(/_/g, '/')))));
async function abreLink(txt) {
  const i = txt.indexOf('#r='); if (i < 0) return false;
  const o = decodifica(txt.slice(i + 3).trim()); delete o.teste; delete o.numero;
  await aplicar(o); $('logoSel').value = S.logo || ''; return true;
}
const linkAtual = () => location.origin + location.pathname + '#r=' + codifica(receita());
$('copiaLink').onclick = async () => {
  const l = linkAtual();
  try { if (navigator.share && matchMedia('(pointer:coarse)').matches) { await navigator.share({ title: 'Gradiente', url: l }); return; } } catch (e) { if (e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(l); aviso('Link copiado. Cole no WhatsApp ou no e-mail.'); } catch (e) { prompt('Copie o link:', l); }
};
$('colaLink').onclick = async () => {
  const t = prompt('Cole aqui o link de gradiente que você recebeu:'); if (!t) return;
  try { aviso(await abreLink(t) ? 'Gradiente do link aberto.' : 'Esse texto não tem um link de gradiente.'); } catch (e) { aviso('Link inválido.'); }
};

// ---------- início ----------
(async () => {
  ajustaTela(); pinta(); listaPaletas(); requestAnimationFrame(quadro);
  try { salvas = await api('/api/paletas'); listaPaletas(); } catch (e) {}
  try {
    const ls = await api('/api/logos');
    $('logoSel').innerHTML = '<option value="">(nenhum / arquivo enviado)</option>' + ls.map(l => `<option value="${l}">${l}</option>`).join('');
    if (!S.logo && ls.length) S.logo = ls.find(l => /p-4/.test(l)) || ls[0];
    $('logoSel').value = S.logo; await logoDaLista(S.logo);
  } catch (e) {}
  pedeNumero();
  if (location.hash.indexOf('#r=') === 0) { try { await abreLink(location.hash); aviso('Gradiente do link aberto.'); } catch (e) { aviso('Link inválido.'); } }
})();
window.G = { ONLINE, abreLink, linkAtual, get S() { return S; }, aplicar, voltar, refazer, novoFx, FX, get hist() { return hist.length; }, desenhar, salvarFrame, exportar, paletaDeImagem, carregarLogo, PADRAO, LIMITE, get faixas() { return faixas; }, get temLogo() { return temLogo; } };
})();
