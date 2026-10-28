(function(){
'use strict'; ATLAS_DATA.pueblos = ATLAS_DATA.pueblos.filter(function(p){ return ['ninguna lengua','takana'].indexOf(String(p.name).trim().toLowerCase()) === -1; });

var GRADO_ORDER = [
  'no corre peligro','estable pero en peligro','vulnerable','entre vulnerable y en peligro',
  'en peligro','entre en peligro y seriamente en peligro','seriamente en peligro',
  'entre seriamente en peligro y situacion critica','situacion critica',
  'entre situacion critica y extinta','extinto'
];
var GRADO_LABELS = {
  'no corre peligro':'No corre peligro',
  'estable pero en peligro':'Estable pero en peligro',
  'vulnerable':'Vulnerable',
  'entre vulnerable y en peligro':'Entre vulnerable y en peligro',
  'en peligro':'En peligro',
  'entre en peligro y seriamente en peligro':'Entre en peligro y seriamente en peligro',
  'seriamente en peligro':'Seriamente en peligro',
  'entre seriamente en peligro y situacion critica':'Entre seriamente en peligro y situación crítica',
  'situacion critica':'Situación crítica',
  'entre situacion critica y extinta':'Entre situación crítica y silenciada',
  'extinto':'Silenciada'
};

function norm(s){
  if(!s) return '';
  return s.trim().toLowerCase()
    .replace(/í/g,'i').replace(/á/g,'a').replace(/é/g,'e').replace(/ó/g,'o').replace(/ú/g,'u');
}

// ---------- Map init ----------
var map = L.map('map', { zoomControl:true, minZoom:4, maxZoom:17 })
  .setView([-13.6, -65.0], 6);

var baseCalles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap',
  maxZoom: 19
}).addTo(map);

var baseSatelite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  attribution: 'Esri, Maxar, Earthstar Geographics',
  maxZoom: 19
});

document.querySelectorAll('#base-toggle button').forEach(function(btn){
  btn.addEventListener('click', function(){
    document.querySelectorAll('#base-toggle button').forEach(function(b){ b.classList.remove('on'); });
    btn.classList.add('on');
    if(btn.dataset.base === 'calles'){
      if(map.hasLayer(baseSatelite)) map.removeLayer(baseSatelite);
      baseCalles.addTo(map);
    } else {
      if(map.hasLayer(baseCalles)) map.removeLayer(baseCalles);
      baseSatelite.addTo(map);
    }
  });
});

// ---------- Popup helpers ----------
var FIELD_ORDER = [
  { key:'Lengua', label:'Lengua' },
  
  { key:'Familia Linguística', label:'Familia lingüística' },
  { key:'Familia linguística', label:'Familia lingüística' },
  { key:'Familia lingüística', label:'Familia lingüística' }, { key:'Ubicación', label:'Ubicación', multiline:true },
  { key:'Superficie', label:'Superficie' }, { key:'Superficie (ha)', label:'Superficie' }, { key:'Superficie (Ha)', label:'Superficie' },
  { key:'Auto identificación', label:'Autoidentificación' },
  { key:'Número de hablantes', label:'Número de hablantes' }, { key:'Número de hablantes ', label:'Número de hablantes' },
  { key:'Grado de vitalidad', label:'Grado de vitalidad' },
  { key:'Grado de vitalidad de la lengua', label:'Grado de vitalidad' },
  
  { key:'Atlas Digital', label:'Descripción', multiline:true }, { key:'Mayor información', label:null, link:true }
];
function buildPopup(name, props, extraNote){
  var html = '<div class="popup-title">'+escapeHtml(name)+'</div>';
  var seen = {};
  FIELD_ORDER.forEach(function(f){
    var val = props[f.key];
    if(!val || !val.trim()) return;
    var seenKey = f.label || f.key;
    if(seen[seenKey]) return;
    if(f.multiline){
      var lineas = val.split('\n').map(function(l){ return l.trim(); }).filter(Boolean);
      html += '<div class="popup-field"><b>'+f.label+':</b><br>'+lineas.map(escapeHtml).join('<br>')+'</div>';
    } else if(f.link){
      var urlMatch = val.match(/https?:\/\/\S+/);
      if(urlMatch){
        var etiqueta = val.slice(0, urlMatch.index).replace(/[:\s]+$/,'').trim() || 'Informe';
        html += '<div class="popup-field"><b>'+escapeHtml(etiqueta)+':</b> <a href="'+urlMatch[0]+'" target="_blank" rel="noopener">Ver documento</a></div>';
      } else {
        html += '<div class="popup-field"><b>Mayor información:</b> '+escapeHtml(val)+'</div>';
      }
    } else {
      html += '<div class="popup-field"><b>'+f.label+':</b> '+escapeHtml(val)+'</div>';
    }
    seen[seenKey] = true;
  });
  if(extraNote){ html += '<div class="popup-field" style="margin-top:6px;">'+extraNote+'</div>'; }
  return html;
}
function fotoSlug(nombre){
  return nombre.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}
function escapeHtml(s){
  return String(s).replace(/[&<>"]/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];
  });
}

// ---------- Color mode ----------
var colorMode = 'vitalidad'; // 'vitalidad' | 'pueblo'

// ---------- Build layers from ATLAS_DATA ----------
var layerDefs = []; // {key, label, type:'polygon'|'line'|'point', leafletLayer, dualColor}
var geoLayers = {}; // key -> L.layerGroup
function darken(hex, amount){
  amount = amount || 0.45;
  var h = hex.replace('#','');
  var r = parseInt(h.substring(0,2),16);
  var g = parseInt(h.substring(2,4),16);
  var b = parseInt(h.substring(4,6),16);
  r = Math.round(r*(1-amount));
  g = Math.round(g*(1-amount));
  b = Math.round(b*(1-amount));
  function hex2(v){ var s = v.toString(16); return s.length===1 ? '0'+s : s; }
  return '#' + hex2(r) + hex2(g) + hex2(b);
}
function styleColorOf(item, dual){
  if(dual){
    return colorMode === 'vitalidad' ? (item.color_vitalidad || '#999999') : (item.color_pueblo || '#2D6A4F');
  }
  return item.color || '#2D6A4F';
}

function addPolygonLayer(key, label, items, opts){
  opts = opts || {};
  var group = L.layerGroup();
  items.forEach(function(item){
    if(!item.geometry) return;
    var layer = L.geoJSON(item.geometry, {
      style: function(){
        var c = styleColorOf(item, opts.dual);
        var stroke = opts.strokeColor || (opts.darkStroke ? darken(c, opts.darkAmount) : c);
        return { color: stroke, weight: opts.weight || 1.2, fillColor: c, fillOpacity: opts.fillOpacity == null ? 0.45 : opts.fillOpacity };
      }
    });
    layer.bindPopup(function(){ return buildPopup(item.name, item.props); });
    layer._atlasItem = item;
    layer._atlasDual = !!opts.dual;
    layer.addTo(group);
  });
  geoLayers[key] = group;
  layerDefs.push({ key:key, label:label, type:'polygon', dual: !!opts.dual, group:group, defaultOn: opts.defaultOn !== false });
}

function addLineLayer(key, label, items, opts){
  opts = opts || {};
  var group = L.layerGroup();
  items.forEach(function(item){
    if(!item.geometry) return;
    var layer = L.geoJSON(item.geometry, {
      style: function(){
        return { color: opts.color || item.color || '#2D6A4F', weight: opts.weight || 2, dashArray: opts.dashArray || null, opacity: 0.85 };
      }
    });
    layer.bindPopup(function(){ return buildPopup(item.name, item.props); });
    layer.addTo(group);
  });
  geoLayers[key] = group;
  layerDefs.push({ key:key, label:label, type:'line', dual:false, group:group, defaultOn: opts.defaultOn !== false, swatchColor: opts.color });
}

function addPointLayer(key, label, items, opts){
  opts = opts || {};
  var group = L.layerGroup();
  items.forEach(function(item){
    var c = styleColorOf(item, true);
    var marker = L.circleMarker([item.lat, item.lng], {
      radius: 6, color:'#ffffff', weight:1.5, fillColor:c, fillOpacity:0.95
    });
        var fotoHtml = '<div style="aspect-ratio:4/3;background:#EFEAE0;border-radius:3px;overflow:hidden;margin-bottom:8px;"><img src="fotos/'+fotoSlug(item.name)+'.jpg" alt="Foto de '+escapeHtml(item.name)+'" style="width:100%;height:100%;object-fit:cover;object-position:center top;display:block;" onerror="this.parentNode.style.display=\'none\';"></div>';
    marker.bindPopup(function(){ return fotoHtml + buildPopup(item.name, item.props) + mapaLinkHtml(item.name); }, { minWidth:260, maxWidth:300 });
    marker._atlasItem = item;
    marker._atlasDual = true;
    marker.addTo(group);
  });
  geoLayers[key] = group;
  layerDefs.push({ key:key, label:label, type:'point', dual:true, group:group, defaultOn: opts.defaultOn !== false });
}

addPolygonLayer('regiones', 'Regiones geoculturales', ATLAS_DATA.regiones, { fillOpacity:0.38, weight:2.2, darkStroke:true, darkAmount:0.5, defaultOn:false });
addPolygonLayer('subregiones', 'Subregiones de la Amazonía', ATLAS_DATA.subregiones, { fillOpacity:0.32, weight:2.4, darkStroke:true, darkAmount:0.5, defaultOn:false });
addLineLayer('departamentos', 'Departamentos de referencia', ATLAS_DATA.departamentos, { color:'#2B2B2B', weight:2.5, dashArray:'4,4', defaultOn:true });
addLineLayer('rios', 'Ríos principales', ATLAS_DATA.rios, { color:'#2E6E8E', weight:1.3, defaultOn:true });
addPolygonLayer('tco', 'Tierras Comunitarias de Origen (TCO)', ATLAS_DATA.tco, { fillOpacity:0.28, weight:2.2, strokeColor:'#6B5B2A', defaultOn:false });
addPolygonLayer('pueblos', 'Pueblos indígenas / vitalidad lingüística', ATLAS_DATA.pueblos, { dual:true, fillOpacity:0.55, weight:1, defaultOn:true });
addPointLayer('comunidades', 'Comunidades focalizadas', ATLAS_DATA.comunidades, { defaultOn:true });

// z-order: regions below, points above
['regiones','subregiones','departamentos','rios','tco','pueblos','comunidades'].forEach(function(key){
  if(geoLayers[key]) geoLayers[key].addTo(map);
});
layerDefs.forEach(function(def){
  if(!def.defaultOn) map.removeLayer(def.group);
});

// ---------- Layer list UI ----------
var layerListEl = document.getElementById('layer-list');
layerDefs.forEach(function(def){
  var row = document.createElement('div');
  row.className = 'layer-item';
  var swatchStyle = '';
  if(def.type === 'line'){
    swatchStyle = 'background:'+ (def.swatchColor||'#2D6A4F') +';';
  } else if(def.dual){
    swatchStyle = 'background:linear-gradient(90deg, #E65100 50%, #7CB342 50%);';
  } else {
    swatchStyle = 'background:#7CB342;';
  }
  row.innerHTML =
    '<input type="checkbox" id="chk-'+def.key+'" '+(def.defaultOn?'checked':'')+'>' +
    '<span class="swatch'+(def.type==='line'?' line':'')+'" style="'+swatchStyle+'"></span>' +
    '<label for="chk-'+def.key+'">'+def.label+'</label>';
  layerListEl.appendChild(row);
  row.querySelector('input').addEventListener('change', function(e){
    if(e.target.checked){ geoLayers[def.key].addTo(map); } else { map.removeLayer(geoLayers[def.key]); }
  });
});

// ---------- Sub-listas desplegables por capa ----------
function zoomToItem(def, item){
  if(!map.hasLayer(def.group)){
    def.group.addTo(map);
    document.getElementById('chk-'+def.key).checked = true;
  }
  var center;
  if(item.lat !== undefined){
    center = L.latLng(item.lat, item.lng);
    map.setView(center, 10);
  } else if(item.geometry){
    var b = L.geoJSON(item.geometry).getBounds();
    map.flyToBounds(b, { maxZoom: 9, duration: 1.2 });
    center = b.getCenter();
  } else { return; }
  var found = null;
  def.group.eachLayer(function(l){ if(l._atlasItem === item){ found = l; } });
  if(found){ setTimeout(function(){ found.openPopup(center); }, item.lat !== undefined ? 0 : 1300); }
  else { L.popup().setLatLng(center).setContent(buildPopup(item.name, item.props || {})).openOn(map); }
}

layerDefs.forEach(function(def){
  var items = ATLAS_DATA[def.key];
  if(!items || !items.length) return;
  var row = document.getElementById('chk-'+def.key).parentNode;

  var arrow = document.createElement('button');
  arrow.type = 'button';
  arrow.className = 'layer-arrow';
  arrow.setAttribute('aria-label', 'Mostrar elementos de la capa');
  arrow.textContent = '▸';
  row.appendChild(arrow);

  var sub = document.createElement('div');
  sub.className = 'layer-sub';
  sub.style.display = 'none';
  items.slice().sort(function(a,b){ var ORDS = { regiones: ['amazonia','oriente boliviano','chaco','altiplano-valles'], subregiones: ['norte amazonico','amazonia sur','norte de la paz','tropico de cochabamba'] }; var ORD = ORDS[def.key]; if(ORD){ var ia = ORD.indexOf(norm(a.name)), ib = ORD.indexOf(norm(b.name)); ia = ia < 0 ? 99 : ia; ib = ib < 0 ? 99 : ib; if(ia !== ib) return ia - ib; } return a.name.localeCompare(b.name); }).forEach(function(item){
    var li = document.createElement('div');
    li.className = 'layer-sub-item';
    li.textContent = item.name;
    li.addEventListener('click', function(){ zoomToItem(def, item); });
    sub.appendChild(li);
  });
  row.parentNode.insertBefore(sub, row.nextSibling);

  arrow.addEventListener('click', function(){
    var open = sub.style.display === 'none';
    sub.style.display = open ? 'block' : 'none';
    arrow.textContent = open ? '▾' : '▸';
  });
});

function refreshDualColors(){
  layerDefs.forEach(function(def){
    if(!def.dual) return;
    def.group.eachLayer(function(layer){
      var item = layer._atlasItem;
      if(!item) return;
      var c = styleColorOf(item, true);
      if(layer.setStyle){ layer.setStyle({ fillColor:c, color: def.type==='point' ? '#ffffff' : c }); }
    });
  });
  buildLegend();
}
document.querySelectorAll('#color-mode-toggle button').forEach(function(btn){
  btn.addEventListener('click', function(){
    document.querySelectorAll('#color-mode-toggle button').forEach(function(b){ b.classList.remove('on'); });
    btn.classList.add('on');
    colorMode = btn.dataset.mode;
    document.getElementById('legend-title').textContent = colorMode === 'vitalidad'
      ? 'Leyenda — Vitalidad lingüística' : 'Leyenda — Pueblos indígenas';
    refreshDualColors();
  });
});

// ---------- Legend ----------
function buildLegend(){
  var box = document.getElementById('legend-box');
  box.innerHTML = '';
  if(colorMode === 'vitalidad'){
    var present = {};
    ATLAS_DATA.pueblos.concat(ATLAS_DATA.comunidades).forEach(function(it){
      var g = gradoCanon(it.props['Grado de vitalidad'] || it.props['Grado de vitalidad de la lengua'] || '');
      if(g) present[g] = it.color_vitalidad;
    });
    GRADO_ORDER.forEach(function(g){
      if(present[g] === undefined) return;
      var row = document.createElement('div');
      row.className = 'legend-row';
      row.innerHTML = '<span class="legend-dot" style="background:'+present[g]+';"></span>'+GRADO_LABELS[g];
      box.appendChild(row);
    });
  } else {
    var note = document.createElement('div');
    note.style.cssText = 'font-size:12px;color:var(--tinta-suave);margin-bottom:8px;';
    note.textContent = 'Cada color identifica un pueblo indígena / territorio distinto. Toca un polígono en el mapa para ver su nombre.';
    box.appendChild(note);
    ATLAS_DATA.pueblos.slice().sort(function(a,b){return a.name.localeCompare(b.name);}).forEach(function(it){
      var row = document.createElement('div');
      row.className = 'legend-row';
      row.innerHTML = '<span class="legend-dot" style="background:'+(it.color_pueblo||'#999')+';"></span>'+it.name;
      box.appendChild(row);
    });
  }
}
buildLegend();

// ---------- Search ----------
var searchIndex = [];
function indexLayer(items, group, kind){
  items.forEach(function(item){
    searchIndex.push({ name:item.name, kind:kind, item:item, group:group });
  });
}
indexLayer(ATLAS_DATA.pueblos, geoLayers.pueblos, 'Pueblo indígena');
indexLayer(ATLAS_DATA.tco, geoLayers.tco, 'TCO');
indexLayer(ATLAS_DATA.comunidades, geoLayers.comunidades, 'Comunidad');
indexLayer(ATLAS_DATA.rios, geoLayers.rios, 'Río');

var searchInput = document.getElementById('search-input');
var searchResults = document.getElementById('search-results');
searchInput.addEventListener('input', function(){
  var q = norm(searchInput.value);
  searchResults.innerHTML = '';
  if(q.length < 2){ searchResults.style.display = 'none'; return; }
  var matches = searchIndex.filter(function(entry){ return norm(entry.name).indexOf(q) !== -1; }).slice(0, 20);
  if(!matches.length){ searchResults.style.display = 'none'; return; }
  matches.forEach(function(entry){
    var div = document.createElement('div');
    div.innerHTML = '<b>'+escapeHtml(entry.name)+'</b> <span style="color:#8a8474;">· '+entry.kind+'</span>';
    div.addEventListener('click', function(){
      searchResults.style.display = 'none';
      searchInput.value = entry.name;
      if(!map.hasLayer(entry.group)){
        var def = layerDefs.filter(function(d){return d.group === entry.group;})[0];
        if(def){ document.getElementById('chk-'+def.key).checked = true; entry.group.addTo(map); }
      }
      if(entry.item.lat !== undefined){
        map.setView([entry.item.lat, entry.item.lng], 10);
        entry.group.eachLayer(function(l){
          if(l._atlasItem === entry.item){ l.openPopup(); }
        });
      } else if(entry.item.geometry){
        var tmp = L.geoJSON(entry.item.geometry);
        map.fitBounds(tmp.getBounds(), { maxZoom:9 });
        entry.group.eachLayer(function(l){
          if(l._atlasItem === entry.item){ l.openPopup(); }
        });
      }
    });
    searchResults.appendChild(div);
  });
  searchResults.style.display = 'block';
});
document.addEventListener('click', function(e){
  if(!searchResults.contains(e.target) && e.target !== searchInput){ searchResults.style.display = 'none'; }
});

// ---------- Measurement tools ----------
var measureMode = null; // 'distance' | 'area' | null
var measurePoints = [];
var measureLayer = L.layerGroup().addTo(map);
var hintEl = document.getElementById('measure-hint');

function metersToText(m){
  return m >= 1000 ? (m/1000).toFixed(2)+' km' : m.toFixed(0)+' m';
}
function sqMetersToText(a){
  return a >= 1000000 ? (a/1000000).toFixed(2)+' km²' : a.toFixed(0)+' m²';
}
// spherical polygon area (m^2), shoelace on equirectangular-ish projection using turf-like formula
function sphericalArea(latlngs){
  var R = 6378137;
  var area = 0;
  var n = latlngs.length;
  for(var i=0;i<n;i++){
    var p1 = latlngs[i], p2 = latlngs[(i+1)%n];
    var lon1 = p1.lng*Math.PI/180, lon2 = p2.lng*Math.PI/180;
    var lat1 = p1.lat*Math.PI/180, lat2 = p2.lat*Math.PI/180;
    area += (lon2-lon1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  return Math.abs(area * R * R / 2);
}

function resetMeasure(){
  measurePoints = [];
  measureLayer.clearLayers();
  hintEl.classList.remove('show');
}
function setMode(mode){
  measureMode = mode;
  resetMeasure();
  document.getElementById('btn-measure-dist').classList.toggle('active', mode==='distance');
  document.getElementById('btn-measure-area').classList.toggle('active', mode==='area');
  hintEl.classList.add('show');
  hintEl.textContent = mode === 'distance'
    ? 'Haz clic en el mapa para trazar puntos. Doble clic para terminar.'
    : (mode === 'area' ? 'Haz clic para marcar los vértices del área. Doble clic para cerrar el polígono.' : '');
  if(!mode) hintEl.classList.remove('show');
}
document.getElementById('btn-measure-dist').addEventListener('click', function(){
  setMode(measureMode === 'distance' ? null : 'distance');
});
document.getElementById('btn-measure-area').addEventListener('click', function(){
  setMode(measureMode === 'area' ? null : 'area');
});
document.getElementById('btn-measure-clear').addEventListener('click', function(){
  setMode(null);
});

map.on('click', function(e){
  if(!measureMode) return;
  measurePoints.push(e.latlng);
  redrawMeasure();
});
map.on('dblclick', function(e){
  if(!measureMode) return;
  L.DomEvent.stop(e);
  if(measurePoints.length >= 2){
    hintEl.textContent = measureMode === 'distance'
      ? 'Distancia total: ' + metersToText(totalDistance(measurePoints))
      : 'Área: ' + sqMetersToText(sphericalArea(measurePoints));
  }
});
function totalDistance(pts){
  var d = 0;
  for(var i=1;i<pts.length;i++){ d += pts[i-1].distanceTo(pts[i]); }
  return d;
}
function redrawMeasure(){
  measureLayer.clearLayers();
  measurePoints.forEach(function(p){
    L.circleMarker(p, { radius:4, color:'#B08926', fillColor:'#B08926', fillOpacity:1 }).addTo(measureLayer);
  });
  if(measurePoints.length >= 2){
    if(measureMode === 'distance'){
      L.polyline(measurePoints, { color:'#B08926', weight:3, dashArray:'6,4' }).addTo(measureLayer);
      hintEl.textContent = 'Distancia parcial: ' + metersToText(totalDistance(measurePoints)) + ' — doble clic para terminar.';
    } else {
      L.polygon(measurePoints, { color:'#B08926', weight:2, fillOpacity:0.15 }).addTo(measureLayer);
      if(measurePoints.length >= 3){
        hintEl.textContent = 'Área parcial: ' + sqMetersToText(sphericalArea(measurePoints)) + ' — doble clic para cerrar.';
      }
    }
  }
}

// ---------- Populate text sections from Referencias ----------
var refs = ATLAS_DATA.referencias;

function htmlBrToParagraphs(text){
  if(!text) return '';
  return text.split('<br><br>').map(function(p){ return '<p>'+p.replace(/<br>/g,'<br>')+'</p>'; }).join('');
}

// Intro: drop the "Accede al documento" line since we already show a button for it
(function(){
  var raw = refs['Introducción'] || '';
  raw = raw.replace(/Accede al documento[\s\S]*?<br><br>/,'');
  raw = raw.replace(/nombre:\s*Introducción/,'').trim();
  var el = document.getElementById('intro-text');
  if(raw){
    el.innerHTML = htmlBrToParagraphs(raw);
  } else {
    el.innerHTML = '<p>Este atlas reúne, por primera vez en un solo mapa, la localización y la situación de vitalidad lingüística de los Pueblos Indígenas de la Amazonía boliviana. Consulta el documento completo de introducción para conocer el marco metodológico.</p>';
  }
})();

// Bibliografía
(function(){
  var raw = refs['Bibliografía cartográfica'] || '';
  raw = raw.replace(/nombre:\s*Bibliografía cartográfica/,'').trim();
  var parts = raw.split('<br><br>');
  var html = '';
  parts.forEach(function(p){
    p = p.trim();
    if(!p) return;
    if(p.indexOf('<br>-') !== -1 || p.indexOf('- ') === 0){
      var items = p.split('<br>').filter(Boolean);
      var listItems = [];
      items.forEach(function(i){
        i = i.trim();
        if(!i) return;
        if(i.indexOf('- ') === 0){
          listItems.push('<li>'+i.replace(/^- /,'')+'</li>');
        } else {
          html += '<p>'+i+'</p>';
        }
      });
      if(listItems.length) html += '<ul>' + listItems.join('') + '</ul>';
    } else {
      html += '<p>'+p.replace(/<br>/g,' ')+'</p>';
    }
  });
  document.getElementById('biblio-text').innerHTML = html;
})();

// Vitalidad scale cards
(function(){
  var raw = refs['Vitalidad Lingüística'] || '';
  raw = raw.replace(/nombre:\s*Vitalidad Lingüística/,'').trim();
  var blocks = raw.split('<br><br>');
  var list = document.getElementById('scale-list');
  var re = /^([^:]+):\s*(.+)$/;
  blocks.forEach(function(b){
    var m = re.exec(b.trim());
    if(!m) return;
    var label = m[1].trim();
    var desc = m[2].trim();
    var key = norm(label === 'Situación crítica' ? 'situacion critica' : label);
    var color = (ATLAS_DATA.grado_color && ATLAS_DATA.grado_color[norm(label)]) || '#999999';
    var row = document.createElement('div');
    row.className = 'scale-item';
    row.innerHTML = '<span class="scale-dot" style="background:'+color+';"></span>' +
      '<div><h4>'+escapeHtml(label.trim().toLowerCase() === 'extinto' ? 'Silenciada' : label)+'</h4><p>'+desc+'</p></div>';
    list.appendChild(row);
  });
})();

// Equipo
(function(){
  var raw = refs['Equipo de trabajo'] || '';
  raw = raw.replace(/nombre:\s*Equipo de trabajo/,'').trim();
  var lines = raw.split('<br>').map(function(s){return s.trim();}).filter(Boolean);
  var grid = document.getElementById('team-grid');
  lines.forEach(function(line){
    if(line.indexOf('(C)') === 0 || /^\d{4}$/.test(line) || /^Octubre/.test(line)) return;
    var m = /^(.*?)\s*\((.*?)\)\s*$/.exec(line);
    var name = m ? m[1] : line;
    var role = m ? m[2] : '';
    var card = document.createElement('div');
    card.className = 'team-card';
    card.innerHTML = '<div class="role">'+escapeHtml(role)+'</div><div class="nm">'+escapeHtml(name)+'</div>';
    grid.appendChild(card);
  });
})();
// Dashboard resumen
(function(){
  function gradoOf(item){
    return gradoCanon(item.props['Grado de vitalidad'] || item.props['Grado de vitalidad de la lengua'] || '');
  }
  function colorOf(key){
    return (ATLAS_DATA.grado_color && ATLAS_DATA.grado_color[key]) || '#999999';
  }

  var stats = [
    { n: ATLAS_DATA.pueblos.length, t:'Pueblos Indígenas identificados en el área geocultural Amazonía boliviana' },
    { n: ATLAS_DATA.tco.length, t:'Territorios indígenas (TCO) reconocidos por el Estado boliviano' },
    { n: ATLAS_DATA.comunidades.length, t:'Comunidades focalizadas para el trabajo de campo' },
    { n: GRADO_ORDER.length, t:'Niveles de vitalidad de los idiomas indígenas en la Amazonía boliviana' }
  ];
  var statRow = document.getElementById('stat-row');
  stats.forEach(function(s){
    var card = document.createElement('div');
    card.className = 'stat-card';
    card.innerHTML = '<div class="stat-circle">'+s.n+'</div><div class="stat-label">'+s.t+'</div>';
    statRow.appendChild(card);
  });

  var countByGrado = {};
  GRADO_ORDER.forEach(function(g){ countByGrado[g] = []; });
  ATLAS_DATA.pueblos.forEach(function(it){
    var g = gradoOf(it);
    if(countByGrado[g]){ countByGrado[g].push(it.name); }
  });

  var totalPueblos = ATLAS_DATA.pueblos.length;
  var idxEnPeligro = GRADO_ORDER.indexOf('en peligro');
  var idxCritica = GRADO_ORDER.indexOf('situacion critica');
  function sumFrom(idx){
    var n = 0;
    GRADO_ORDER.forEach(function(g,i){ if(i >= idx) n += countByGrado[g].length; });
    return n;
  }
  var nPeligroOMas = sumFrom(idxEnPeligro);
  var nCriticaOMas = sumFrom(idxCritica);
  var pctPeligro = totalPueblos ? Math.round(nPeligroOMas/totalPueblos*100) : 0;

  var highlights = [
    { num: nPeligroOMas+' de '+totalPueblos+' ('+pctPeligro+'%)', txt:'idiomas indígenas se encuentran entre los niveles "en peligro" y "silenciada".' },
    { num: nCriticaOMas, txt:'idiomas están en situación crítica o ya silenciados.' }
  ];
  var hRow = document.getElementById('highlight-row');
  highlights.forEach(function(h){
    var card = document.createElement('div');
    card.className = 'highlight-card';
    card.innerHTML = '<div class="num">'+h.num+'</div><div class="txt">'+h.txt+'</div>';
    hRow.appendChild(card);
  });

  var barsEl = document.getElementById('vital-bars');
  var maxCount = Math.max.apply(null, GRADO_ORDER.map(function(g){ return countByGrado[g].length; }).concat([1]));
  GRADO_ORDER.forEach(function(g){
    var n = countByGrado[g].length;
    var row = document.createElement('div');
    row.className = 'vital-bar-row';
    row.innerHTML =
      '<div class="lbl">'+GRADO_LABELS[g]+'</div>'+
      '<div class="vital-bar-track"><div class="vital-bar-fill" style="width:'+(n/maxCount*100)+'%;background:'+colorOf(g)+';"></div></div>'+
      '<div class="cnt">'+n+'</div>';
    barsEl.appendChild(row);
  });

  function buildTable(tableId, items){
    var countG = {};
    GRADO_ORDER.forEach(function(g){ countG[g] = []; });
    items.forEach(function(it){
      var g = gradoOf(it);
      if(countG[g]){ countG[g].push(it.name); }
    });
    var table = document.getElementById(tableId);
    var html = '<thead><tr><th>N°</th><th>Nivel de peligro</th><th>Elementos</th></tr></thead><tbody>';
    GRADO_ORDER.forEach(function(g, i){
      var names = countG[g].slice().sort();
      var cell = names.length
        ? '<ul>' + names.map(function(n){return '<li>'+escapeHtml(n)+'</li>';}).join('') + '</ul>'
        : '<span class="vacio">Ninguna lengua</span>';
      html += '<tr><td class="n">'+(i+1)+'</td><td class="nivel"><span class="dot" style="background:'+colorOf(g)+';"></span>'+GRADO_LABELS[g]+'</td><td>'+cell+'</td></tr>';
    });
    html += '</tbody>';
    table.innerHTML = html;
  }
  buildTable('table-pueblos', ATLAS_DATA.pueblos);
  buildTable('table-comunidades', ATLAS_DATA.comunidades);
})();
// Dashboard: página "Evolución por pueblo" (histograma de autoidentificación y número de hablantes, censos 2001, 2012 y 2024)
(function(){
  var track = document.getElementById('dash-track');
  if(!track || !track.children.length) return;

  // [nombre, palabras clave, autoid. 2001, 2012, 2024, hablantes 2001, 2012, 2024, nota opcional]
  var DATOS = [
    ['Ese Ejja', ['ejja','eja'], 337, 1687, 1927, 518, 773, 1382],
    ["Tsimane'", ['tsimane','chimane'], 4331, 16958, 22343, 6352, 10972, 18909],
    ['Araona', ['araona'], 92, 228, 147, 111, 26, 114],
    ['Yaminahua', ['yaminawa','yaminahua'], 45, 259, 228, 51, 155, 112],
    ['Yuki', ['yuqui','yuki'], 112, 342, 478, 140, 143, 266],
    ['Chácobo', ['chacobo'], 255, 1532, 1530, 380, 967, 1364],
    ['Mosetén', ['moseten','mosetene'], 813, 3516, 4099, 924, 819, 792],
    ['Moxeño Ignaciano', ['ignaciano'], 192, 1007, 9076, 1080, 1057, 286],
    ['Sirionó', ['siriono'], 134, 782, 722, 189, 176, 69],
    ['Movima', ['movima'], 6186, 18879, 10654, 1173, 503, 173],
    ['Moxeño Trinitario', ['trinitario'], 2744, 7073, 14457, 3140, 2673, 1442],
    ['Tacana', ['takana','tacana'], 3583, 18535, 19350, 1154, 843, 578],
    ['Yurakaré', ['yurakare'], 1399, 6042, 6480, 1791, 1441, 849],
    ['Baures', ['baure','baures'], 487, 3328, 1618, 67, 21, 10],
    ['Cavineño', ['cavineno'], 852, 3884, 5344, 601, 779, 973],
    ['Machineri', ['machineri'], 15, 52, 72, 13, 9, 12],
    ['Pacahuara', ['pacahuara'], 32, 227, 70, 6, 7, 30],
    ['Itonama', ['itonama'], 1493, 16158, 5612, 389, 29, 35],
    ['Maropa', ['maropa'], 2741, 4757, 2903, 53, 117, 26, 'En Maropa, la autoidentificación de 2012 y 2024 suma las cifras de Reyesano y Maropa.'],
    ['Moré', ['more'], 44, 255, 212, 44, 8, 10],
    ['Canichana', ['canichana','kanichana'], 213, 899, 865, 4, 7, 8],
    ['Cayubaba', ['cayubaba'], 328, 2203, 1064, 23, 12, 5],
    ['Joaquiniano', ['joaquiniano'], 171, 4223, 1992, 13, 0, 7]
  ];
  var ANIOS = [2001, 2012, 2024];
  var C_AUTO = '#2D6A4F', C_HABL = '#B08926';

  var st = document.createElement('style');
  st.textContent =
    '.evo-sub{font-size:13px;color:#6b6657;margin:2px 0 10px;}'+
    '.evo-ctrl{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:8px 0 14px;}'+
    '.evo-btn{border:1px solid #C9C1AE;background:#fff;color:#2b2b2b;border-radius:6px;padding:7px 12px;font-size:13px;cursor:pointer;}'+
    '.evo-btn:hover{background:#EFEAE0;}'+
    '.evo-select{flex:1 1 180px;min-width:0;padding:7px 10px;border:1px solid #C9C1AE;border-radius:6px;font-size:14px;background:#fff;}'+
    '.evo-cnt{font-size:12px;color:#8a8474;margin-left:auto;}'+
    '.evo-head{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin:4px 0 6px;}'+
    '.evo-name{font-size:22px;font-weight:700;color:#951C23;}'+
    '.evo-grado{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:#4a4638;}'+
    '.evo-sw{display:inline-block;width:12px;height:12px;border-radius:50%;flex:none;margin-right:6px;box-shadow:0 0 0 2px #fff,0 0 0 3px rgba(0,0,0,.2);}'+
    '.evo-grado .evo-sw{margin-right:0;}'+
    '.evo-leg{display:flex;flex-wrap:wrap;gap:16px;font-size:13px;margin:4px 0 2px;}'+
    '.evo-leg span{display:inline-flex;align-items:center;gap:6px;}'+
    '.evo-leg i{display:inline-block;width:14px;height:14px;border-radius:3px;}'+
    '.evo-tabla{border-collapse:collapse;margin:12px 0 4px;font-size:13px;width:100%;max-width:560px;}'+
    '.evo-tabla th,.evo-tabla td{padding:6px 10px;border-bottom:1px solid #E3DDCF;text-align:left;}'+
    '.evo-tabla th{font-weight:600;color:#6b6657;}'+
    '.evo-up{color:#2D6A4F;font-weight:700;}'+
    '.evo-down{color:#951C23;font-weight:700;}'+
    '.evo-nd{color:#8a8474;}'+
    '.evo-nota{font-size:12px;color:#6b6657;margin:8px 0 0;}';
  document.head.appendChild(st);

  function fmt(n){ return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function paso(max){
    var exp = Math.pow(10, Math.floor(Math.log(max) / Math.LN10));
    var f = max / exp;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp;
  }
  function pct(a, b){
    if(!a){ return '<span class="evo-nd">n/d</span>'; }
    var p = Math.round((b - a) / a * 100);
    if(p === 0){ return '0%'; }
    return p > 0 ? '<span class="evo-up">▲ +' + fmt(p) + '%</span>' : '<span class="evo-down">▼ −' + fmt(Math.abs(p)) + '%</span>';
  }
  function grafico(d){
    var auto = [d[2], d[3], d[4]], habl = [d[5], d[6], d[7]];
    var maxV = Math.max.apply(null, auto.concat(habl).concat([1]));
    var stp = Math.max(1, paso(maxV / 4)), top = stp * Math.ceil(maxV / stp);
    var W = 720, H = 380, L = 64, R = 16, T = 30, B = 62;
    var pw = W - L - R, ph = H - T - B, gw = pw / 3, bw = 66, gap = 10;
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Autoidentificación y número de hablantes en los censos 2001, 2012 y 2024" style="width:100%;height:auto;display:block;font-family:inherit;">';
    for(var v = 0; v <= top + 0.0001; v += stp){
      var y = T + ph - (v / top) * ph;
      s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '" stroke="' + (v === 0 ? '#8a8474' : '#E3DDCF') + '" stroke-width="' + (v === 0 ? 1.4 : 1) + '"/>';
      s += '<text x="' + (L - 8) + '" y="' + (y + 4) + '" text-anchor="end" font-size="12" fill="#6b6657">' + fmt(Math.round(v)) + '</text>';
    }
    ANIOS.forEach(function(a, i){
      var gx = L + i * gw + (gw - (2 * bw + gap)) / 2;
      [[auto[i], C_AUTO, 0], [habl[i], C_HABL, bw + gap]].forEach(function(b){
        var h = (b[0] / top) * ph, x = gx + b[2], yb = T + ph - h;
        s += '<rect x="' + x + '" y="' + yb + '" width="' + bw + '" height="' + h + '" rx="3" fill="' + b[1] + '"/>';
        s += '<text x="' + (x + bw / 2) + '" y="' + (yb - 6) + '" text-anchor="middle" font-size="13" font-weight="700" fill="#2b2b2b">' + fmt(b[0]) + '</text>';
      });
      s += '<text x="' + (gx + bw + gap / 2) + '" y="' + (T + ph + 24) + '" text-anchor="middle" font-size="14" font-weight="700" fill="#2b2b2b">Censo ' + a + '</text>';
    });
    return s + '</svg>';
  }
  function tabla(d){
    function fila(color, nombre, v){
      return '<tr><td><span class="evo-sw" style="background:' + color + ';"></span>' + nombre + '</td><td>' + pct(v[0], v[1]) + '</td><td>' + pct(v[1], v[2]) + '</td></tr>';
    }
    return '<table class="evo-tabla"><thead><tr><th>Variación entre censos</th><th>2001 → 2012</th><th>2012 → 2024</th></tr></thead><tbody>' +
      fila(C_AUTO, 'Autoidentificación', [d[2], d[3], d[4]]) +
      fila(C_HABL, 'Número de hablantes', [d[5], d[6], d[7]]) + '</tbody></table>';
  }
  function gradoDe(claves){
    var it = ATLAS_DATA.pueblos.filter(function(p){
      var w = fotoSlug(p.name).split('-');
      return claves.some(function(k){ return w.indexOf(k) !== -1; });
    })[0];
    if(!it) return null;
    var g = gradoCanon(it.props['Grado de vitalidad'] || it.props['Grado de vitalidad de la lengua'] || '');
    if(!GRADO_LABELS[g]) return null;
    var base = (ATLAS_DATA.grado_color && ATLAS_DATA.grado_color[g]) || it.color_vitalidad || '#999999';
    return { etiqueta: GRADO_LABELS[g], fondo: fondoNivel(g, base) };
  }

  var slide = document.createElement('div');
  slide.className = track.children[0].className;
  slide.innerHTML =
    '<h3>Evolución por pueblo indígena (Censos 2001, 2012 y 2024)</h3>' +
    '<p class="evo-sub">Elige un pueblo con la lista o con los botones. Cada grupo de barras compara la autoidentificación y el número de hablantes en un censo.</p>' +
    '<div class="evo-ctrl">' +
      '<button type="button" class="evo-btn evo-prev" title="Pueblo anterior">◂ Anterior</button>' +
      '<select class="evo-select" aria-label="Elegir pueblo indígena"></select>' +
      '<button type="button" class="evo-btn evo-next" title="Pueblo siguiente">Siguiente ▸</button>' +
      '<span class="evo-cnt"></span>' +
    '</div>' +
    '<div class="evo-head"><span class="evo-name"></span><span class="evo-grado"></span></div>' +
    '<div class="evo-leg"><span><i style="background:' + C_AUTO + ';"></i>Autoidentificación</span><span><i style="background:' + C_HABL + ';"></i>Número de hablantes</span></div>' +
    '<div class="evo-chart"></div>' +
    '<div class="evo-var"></div>' +
    '<p class="evo-nota"></p>';
  track.appendChild(slide);

  function $(q){ return slide.querySelector(q); }
  var idx = 0, sel = $('.evo-select');
  DATOS.forEach(function(d, i){
    var o = document.createElement('option');
    o.value = i;
    o.textContent = (i + 1) + '. ' + d[0];
    sel.appendChild(o);
  });
  function render(i){
    idx = (i + DATOS.length) % DATOS.length;
    var d = DATOS[idx];
    sel.value = idx;
    $('.evo-cnt').textContent = (idx + 1) + ' de ' + DATOS.length;
    $('.evo-name').textContent = d[0];
    var g = gradoDe(d[1]);
    $('.evo-grado').innerHTML = g ? '<span class="evo-sw" style="background:' + g.fondo + ';"></span>' + escapeHtml(g.etiqueta) : '';
    $('.evo-chart').innerHTML = grafico(d);
    $('.evo-var').innerHTML = tabla(d);
    $('.evo-nota').textContent = (d[8] ? d[8] + ' ' : '') + 'Cifras de autoidentificación y número de hablantes por censo.';
    window.dispatchEvent(new Event('resize'));
  }
  $('.evo-prev').addEventListener('click', function(){ render(idx - 1); });
  $('.evo-next').addEventListener('click', function(){ render(idx + 1); });
  sel.addEventListener('change', function(){ render(parseInt(sel.value, 10)); });
  render(0);

  // Si el carrusel ya se inició, agrega el punto de la nueva página
  var dotsEl = document.getElementById('dash-dots');
  var nextBtn = document.getElementById('dash-next');
  if(dotsEl && nextBtn && dotsEl.children.length && dotsEl.children.length < track.children.length){
    var dot = document.createElement('button');
    dot.addEventListener('click', function(){
      var dots = Array.prototype.slice.call(dotsEl.children);
      var cur = 0;
      dots.forEach(function(x, i){ if(x.className === 'on'){ cur = i; } });
      var pasos = (dots.indexOf(dot) - cur + dots.length) % dots.length;
      for(var k = 0; k < pasos; k++){ nextBtn.click(); }
    });
    dotsEl.appendChild(dot);
  }
})();
// Dashboard: página "Panorama de los pueblos" (cambio entre censos de los 23 pueblos, escala logarítmica)
(function(){
  var track = document.getElementById('dash-track');
  if(!track || !track.children.length) return;

  // [nombre, palabras clave, autoid. 2001, 2012, 2024, hablantes 2001, 2012, 2024]
  var DATOS = [
    ['Ese Ejja', ['ejja','eja'], 337, 1687, 1927, 518, 773, 1382],
    ["Tsimane'", ['tsimane','chimane'], 4331, 16958, 22343, 6352, 10972, 18909],
    ['Araona', ['araona'], 92, 228, 147, 111, 26, 114],
    ['Yaminahua', ['yaminawa','yaminahua'], 45, 259, 228, 51, 155, 112],
    ['Yuki', ['yuqui','yuki'], 112, 342, 478, 140, 143, 266],
    ['Chácobo', ['chacobo'], 255, 1532, 1530, 380, 967, 1364],
    ['Mosetén', ['moseten','mosetene'], 813, 3516, 4099, 924, 819, 792],
    ['Moxeño Ignaciano', ['ignaciano'], 192, 1007, 9076, 1080, 1057, 286],
    ['Sirionó', ['siriono'], 134, 782, 722, 189, 176, 69],
    ['Movima', ['movima'], 6186, 18879, 10654, 1173, 503, 173],
    ['Moxeño Trinitario', ['trinitario'], 2744, 7073, 14457, 3140, 2673, 1442],
    ['Tacana', ['takana','tacana'], 3583, 18535, 19350, 1154, 843, 578],
    ['Yurakaré', ['yurakare'], 1399, 6042, 6480, 1791, 1441, 849],
    ['Baures', ['baure','baures'], 487, 3328, 1618, 67, 21, 10],
    ['Cavineño', ['cavineno'], 852, 3884, 5344, 601, 779, 973],
    ['Machineri', ['machineri'], 15, 52, 72, 13, 9, 12],
    ['Pacahuara', ['pacahuara'], 32, 227, 70, 6, 7, 30],
    ['Itonama', ['itonama'], 1493, 16158, 5612, 389, 29, 35],
    ['Maropa', ['maropa'], 2741, 4757, 2903, 53, 117, 26],
    ['Moré', ['more'], 44, 255, 212, 44, 8, 10],
    ['Canichana', ['canichana','kanichana'], 213, 899, 865, 4, 7, 8],
    ['Cayubaba', ['cayubaba'], 328, 2203, 1064, 23, 12, 5],
    ['Joaquiniano', ['joaquiniano'], 171, 4223, 1992, 13, 0, 7]
  ];
  var C_UP = '#2D6A4F', C_DOWN = '#951C23', C_EQ = '#8a8474';
  var PERIODOS = [['2001', '2012'], ['2012', '2024']];
  var ind = 'h', per = 1;

  var st = document.createElement('style');
  st.textContent =
    '.pan-sub{font-size:13px;color:#6b6657;margin:2px 0 10px;}'+
    '.pan-ctrl{display:flex;flex-wrap:wrap;gap:10px 22px;margin:8px 0 12px;align-items:center;}'+
    '.pan-ctrl label{font-size:12px;color:#6b6657;margin-right:8px;}'+
    '.pan-seg{display:inline-flex;border:1px solid #C9C1AE;border-radius:6px;overflow:hidden;vertical-align:middle;}'+
    '.pan-seg button{border:0;background:#fff;padding:7px 12px;font-size:13px;cursor:pointer;color:#2b2b2b;}'+
    '.pan-seg button + button{border-left:1px solid #C9C1AE;}'+
    '.pan-seg button.on{background:#951C23;color:#fff;}'+
    '.pan-resumen{display:flex;flex-wrap:wrap;gap:10px;margin:6px 0 14px;}'+
    '.pan-card{flex:1 1 180px;border:1px solid #E3DDCF;border-radius:8px;padding:8px 12px;background:#fff;}'+
    '.pan-card b{display:block;font-size:18px;line-height:1.3;}'+
    '.pan-card span{display:block;font-size:12px;color:#6b6657;margin-top:2px;}'+
    '.pan-up{color:#2D6A4F;font-weight:700;}'+
    '.pan-down{color:#951C23;font-weight:700;}'+
    '.pan-nd{color:#8a8474;}'+
    '.pan-leg{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:12px;color:#4a4638;margin:0 0 8px;align-items:center;}'+
    '.pan-leg i{display:inline-block;width:11px;height:11px;border-radius:50%;box-sizing:border-box;border:2px solid #4a4638;vertical-align:middle;margin-right:4px;}'+
    '.pan-leg i.fill{background:#4a4638;}'+
    '.pan-eje,.pan-row{display:grid;grid-template-columns:170px 1fr 215px;align-items:center;gap:0 12px;}'+
    '.pan-eje{font-size:11px;color:#6b6657;padding-bottom:4px;}'+
    '.pan-ejetrack{position:relative;height:16px;}'+
    '.pan-ejetrack span{position:absolute;top:0;white-space:nowrap;}'+
    '.pan-row{padding:3px 0;border-bottom:1px solid #F0EBDD;}'+
    '.pan-name{display:flex;align-items:center;gap:8px;font-size:13px;min-width:0;}'+
    '.pan-name .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'+
    '.pan-sw{width:12px;height:12px;border-radius:50%;flex:none;box-shadow:0 0 0 2px #fff,0 0 0 3px rgba(0,0,0,.2);}'+
    '.pan-track{position:relative;height:18px;}'+
    '.pan-line{position:absolute;top:8px;height:3px;border-radius:2px;}'+
    '.pan-dot{position:absolute;top:3px;width:12px;height:12px;margin-left:-6px;border-radius:50%;box-sizing:border-box;border:2px solid;background:#fff;}'+
    '.pan-val{font-size:12px;color:#4a4638;white-space:nowrap;}'+
    '.pan-nota{font-size:12px;color:#6b6657;margin:10px 0 0;line-height:1.5;}'+
    '@media (max-width:640px){'+
      '.pan-row{grid-template-columns:1fr auto;}'+
      '.pan-track{grid-column:1 / -1;order:3;margin-top:2px;}'+
      '.pan-eje{grid-template-columns:1fr;}'+
      '.pan-eje > :first-child,.pan-eje > :last-child{display:none;}'+
    '}';
  document.head.appendChild(st);

  function fmt(n){ return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function cambio(a, b){
    if(!a){ return '<span class="pan-nd">n/d</span>'; }
    var p = Math.round((b - a) / a * 100);
    if(p === 0){ return '0%'; }
    return p > 0 ? '<span class="pan-up">▲ +' + fmt(p) + '%</span>' : '<span class="pan-down">▼ −' + fmt(Math.abs(p)) + '%</span>';
  }
  function gradoDe(claves){
    var it = ATLAS_DATA.pueblos.filter(function(p){
      var w = fotoSlug(p.name).split('-');
      return claves.some(function(k){ return w.indexOf(k) !== -1; });
    })[0];
    if(!it) return null;
    var g = gradoCanon(it.props['Grado de vitalidad'] || it.props['Grado de vitalidad de la lengua'] || '');
    if(!GRADO_LABELS[g]) return null;
    var base = (ATLAS_DATA.grado_color && ATLAS_DATA.grado_color[g]) || it.color_vitalidad || '#999999';
    return { etiqueta: GRADO_LABELS[g], fondo: fondoNivel(g, base) };
  }

  var slide = document.createElement('div');
  slide.className = track.children[0].className;
  slide.innerHTML =
    '<h3>Panorama de los 23 pueblos: cambio entre censos</h3>' +
    '<p class="pan-sub">Cada fila muestra el cambio de un pueblo entre dos censos. La escala es logarítmica: la misma distancia equivale al mismo cambio porcentual, sin importar el tamaño del pueblo.</p>' +
    '<div class="pan-ctrl">' +
      '<div><label>Indicador</label><span class="pan-seg" data-g="ind"><button type="button" data-v="h" class="on">Número de hablantes</button><button type="button" data-v="a">Autoidentificación</button></span></div>' +
      '<div><label>Periodo</label><span class="pan-seg" data-g="per"><button type="button" data-v="1" class="on">2012 → 2024</button><button type="button" data-v="0">2001 → 2012</button></span></div>' +
    '</div>' +
    '<div class="pan-resumen"></div>' +
    '<div class="pan-leg"><span><i></i>Censo inicial</span><span><i class="fill"></i>Censo final</span><span><b class="pan-down">Rojo</b>: disminuye</span><span><b class="pan-up">Verde</b>: aumenta</span></div>' +
    '<div class="pan-eje"><div>Escala logarítmica</div><div class="pan-ejetrack"></div><div></div></div>' +
    '<div class="pan-filas"></div>' +
    '<p class="pan-nota"></p>';
  track.appendChild(slide);

  function $(q){ return slide.querySelector(q); }

  function render(){
    var ia = ind === 'h' ? 5 : 2;
    var i0 = ia + per, i1 = ia + per + 1;
    var rows = DATOS.map(function(d){
      var a = d[i0], b = d[i1];
      return { d: d, a: a, b: b, p: a ? (b - a) / a : null };
    });
    rows.sort(function(x, y){
      if(x.p === null && y.p === null){ return x.d[0].localeCompare(y.d[0]); }
      if(x.p === null){ return 1; }
      if(y.p === null){ return -1; }
      return x.p - y.p;
    });

    // Escala logarítmica
    var positivos = [];
    rows.forEach(function(r){ if(r.a > 0){ positivos.push(r.a); } if(r.b > 0){ positivos.push(r.b); } });
    var lo = Math.floor(Math.log(Math.min.apply(null, positivos)) / Math.LN10);
    var hi = Math.ceil(Math.log(Math.max.apply(null, positivos)) / Math.LN10);
    if(hi <= lo){ hi = lo + 1; }
    function px(v){
      var x = (Math.log(Math.max(v, 1)) / Math.LN10 - lo) / (hi - lo) * 100;
      return Math.max(0, Math.min(100, x));
    }
    var ticks = '', grid = [];
    for(var e = lo; e <= hi; e++){
      var x = (e - lo) / (hi - lo) * 100;
      ticks += '<span style="left:' + x + '%;transform:' + (x < 5 ? 'none' : (x > 95 ? 'translateX(-100%)' : 'translateX(-50%)')) + ';">' + fmt(Math.pow(10, e)) + '</span>';
      grid.push('linear-gradient(#E3DDCF,#E3DDCF) ' + x + '% 0/1px 100% no-repeat');
    }
    $('.pan-ejetrack').innerHTML = ticks;
    var fondoGrid = grid.join(',');

    // Filas
    var h = '';
    rows.forEach(function(r){
      var col = r.b > r.a ? C_UP : (r.b < r.a ? C_DOWN : C_EQ);
      var x0 = px(r.a), x1 = px(r.b), g = gradoDe(r.d[1]);
      h += '<div class="pan-row" title="' + escapeHtml(r.d[0] + ': ' + fmt(r.a) + ' → ' + fmt(r.b)) + '">' +
        '<div class="pan-name">' + (g ? '<span class="pan-sw" style="background:' + g.fondo + ';" title="' + escapeHtml(g.etiqueta) + '"></span>' : '') + '<span class="nm">' + escapeHtml(r.d[0]) + '</span></div>' +
        '<div class="pan-track" style="background:' + fondoGrid + ';">' +
          '<span class="pan-line" style="left:' + Math.min(x0, x1) + '%;width:' + Math.abs(x1 - x0) + '%;background:' + col + ';"></span>' +
          '<span class="pan-dot" style="left:' + x0 + '%;border-color:' + col + ';"></span>' +
          '<span class="pan-dot" style="left:' + x1 + '%;border-color:' + col + ';background:' + col + ';"></span>' +
        '</div>' +
        '<div class="pan-val">' + fmt(r.a) + ' → ' + fmt(r.b) + ' &nbsp;' + cambio(r.a, r.b) + '</div>' +
      '</div>';
    });
    $('.pan-filas').innerHTML = h;

    // Resumen
    var bajan = 0, suben = 0, sinBase = 0, sa = 0, sb = 0, mx = null;
    rows.forEach(function(r){
      if(!r.a){ sinBase++; } else if(r.b < r.a){ bajan++; } else if(r.b > r.a){ suben++; }
      sa += r.a; sb += r.b;
      if(!mx || r.b > mx.b){ mx = r; }
    });
    var que = ind === 'h' ? 'hablantes' : 'personas autoidentificadas';
    var etq = PERIODOS[per][0] + ' → ' + PERIODOS[per][1];
    var cards =
      '<div class="pan-card"><b class="pan-down">▼ ' + bajan + '</b><span>pueblos con menos ' + que + ' (' + etq + ')</span></div>' +
      '<div class="pan-card"><b class="pan-up">▲ ' + suben + '</b><span>pueblos con más ' + que + '</span></div>';
    if(sinBase){ cards += '<div class="pan-card"><b class="pan-nd">n/d ' + sinBase + '</b><span>sin cifra base (0 en el censo inicial)</span></div>'; }
    cards += '<div class="pan-card"><b>' + fmt(sa) + ' → ' + fmt(sb) + ' ' + cambio(sa, sb) + '</b><span>Suma de los ' + rows.length + ' pueblos</span>' +
      '<span>Sin ' + escapeHtml(mx.d[0]) + ': ' + fmt(sa - mx.a) + ' → ' + fmt(sb - mx.b) + ' ' + cambio(sa - mx.a, sb - mx.b) + '</span></div>';
    $('.pan-resumen').innerHTML = cards;

    $('.pan-nota').innerHTML =
      'Orden: de mayor pérdida a mayor aumento relativo. En pueblos con pocas personas, un cambio pequeño modifica mucho el porcentaje; conviene leer también las cifras. ' +
      'Las variaciones pueden reflejar diferencias en cómo cada censo preguntó por la identificación y la lengua, por lo que se recomienda interpretarlas con cautela.' +
      (ind === 'a' ? ' En Maropa, la autoidentificación de 2012 y 2024 suma las cifras de Reyesano y Maropa.' : '');
    window.dispatchEvent(new Event('resize'));
  }

  slide.addEventListener('click', function(ev){
    var b = ev.target.closest ? ev.target.closest('.pan-seg button') : null;
    if(!b) return;
    var grupo = b.parentNode;
    Array.prototype.forEach.call(grupo.children, function(x){ x.classList.remove('on'); });
    b.classList.add('on');
    if(grupo.getAttribute('data-g') === 'ind'){ ind = b.getAttribute('data-v'); }
    else { per = parseInt(b.getAttribute('data-v'), 10); }
    render();
  });
  render();

  // Si el carrusel ya se inició, agrega el punto de la nueva página
  var dotsEl = document.getElementById('dash-dots');
  var nextBtn = document.getElementById('dash-next');
  if(dotsEl && nextBtn && dotsEl.children.length && dotsEl.children.length < track.children.length){
    var dot = document.createElement('button');
    dot.addEventListener('click', function(){
      var dots = Array.prototype.slice.call(dotsEl.children);
      var cur = 0;
      dots.forEach(function(x, i){ if(x.className === 'on'){ cur = i; } });
      var pasos = (dots.indexOf(dot) - cur + dots.length) % dots.length;
      for(var k = 0; k < pasos; k++){ nextBtn.click(); }
    });
    dotsEl.appendChild(dot);
  }
})();
// Carrusel del dashboard
(function(){
  var track = document.getElementById('dash-track');
  var viewport = document.getElementById('dash-viewport');
  var prevBtn = document.getElementById('dash-prev');
  var nextBtn = document.getElementById('dash-next');
  var dotsEl = document.getElementById('dash-dots');
  if(!track) return;
  var slides = track.children;
  var current = 0;

  for(var i=0;i<slides.length;i++){
    var dot = document.createElement('button');
    if(i===0) dot.className = 'on';
    dot.addEventListener('click', (function(idx){ return function(){ goTo(idx); }; })(i));
    dotsEl.appendChild(dot);
  }

  function updateHeight(){
    viewport.style.height = slides[current].offsetHeight + 'px';
  }
  function goTo(idx){
    current = (idx + slides.length) % slides.length;
    track.style.transform = 'translateX(-' + (current*100) + '%)';
    Array.prototype.forEach.call(dotsEl.children, function(d,i){ d.className = i===current ? 'on' : ''; });
    updateHeight();
  }
  prevBtn.addEventListener('click', function(){ goTo(current-1); });
  nextBtn.addEventListener('click', function(){ goTo(current+1); });
  window.addEventListener('resize', updateHeight);
  updateHeight();
})();
// Resaltado del menú según la sección visible
(function(){
  var navLinks = document.querySelectorAll('nav.mainnav a[href^="#"]');
  if(!navLinks.length) return;
  var map = [];
  navLinks.forEach(function(link){
    var id = link.getAttribute('href').slice(1);
    var section = document.getElementById(id);
    if(section){ map.push({ link:link, section:section }); }
  });
  if(!map.length) return;

  var observer = new IntersectionObserver(function(entries){
    entries.forEach(function(entry){
      if(entry.isIntersecting){
        map.forEach(function(m){ m.link.classList.remove('active'); });
        var match = map.filter(function(m){ return m.section === entry.target; })[0];
        if(match) match.link.classList.add('active');
      }
    });
  }, { rootMargin: '-40% 0px -55% 0px', threshold: 0 });

  map.forEach(function(m){ observer.observe(m.section); });
})();
// Mapas parlantes: enlace en el popup + visor ampliado
var MAPAS_PARLANTES = [
  'eyiyoquibo','la-chacra','palmar-de-aguas-negras','puerto-yaminahua','san-jose',
  'san-miguel-de-machineri','santa-elena-b','santa-rosa-de-maravilla','tacuaral-del-matto','tumupasa'
];
function mapaLinkHtml(nombre){
  var slug = fotoSlug(nombre);
  if(MAPAS_PARLANTES.indexOf(slug) === -1) return '';
  return '<div class="popup-field"><b>Mapa parlante:</b> <a href="mapas/'+slug+'.jpg" target="_blank" rel="noopener" data-mapa="'+slug+'" data-nombre="'+escapeHtml(nombre)+'">Ver mapa</a></div>';
}
(function(){
  var st = document.createElement('style');
  st.textContent =
    '#mapa-visor{position:fixed;top:0;right:0;bottom:0;left:0;z-index:10000;display:none;flex-direction:column;background:rgba(30,8,12,.92);}'+
    '#mapa-visor.on{display:flex;}'+
    '#mapa-visor .mv-bar{display:flex;align-items:center;gap:10px;padding:10px 14px;color:#fff;}'+
    '#mapa-visor .mv-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;}'+
    '#mapa-visor .mv-bar a,#mapa-visor .mv-bar button{color:#fff;background:rgba(255,255,255,.16);border:0;border-radius:4px;padding:6px 10px;font-size:13px;cursor:pointer;text-decoration:none;}'+
    '#mapa-visor .mv-x{font-size:20px !important;line-height:1;padding:3px 10px !important;}'+
    '#mapa-visor .mv-stage{flex:1;min-height:0;display:flex;overflow:auto;padding:0 10px 14px;}'+
    '#mapa-visor img{display:block;margin:auto;flex:none;max-width:100%;max-height:calc(100vh - 90px);background:#fff;border-radius:3px;cursor:zoom-in;}'+
    '#mapa-visor.zoom img{max-width:none;max-height:none;cursor:zoom-out;}';
  document.head.appendChild(st);

  var visor, stage, imgEl, titleEl, openEl, zoomBtn;
  function build(){
    visor = document.createElement('div');
    visor.id = 'mapa-visor';
    visor.setAttribute('role','dialog');
    visor.setAttribute('aria-modal','true');
    visor.innerHTML =
      '<div class="mv-bar"><div class="mv-title"></div>'+
      '<button type="button" class="mv-zoom">Ampliar</button>'+
      '<a class="mv-open" target="_blank" rel="noopener">Abrir imagen</a>'+
      '<button type="button" class="mv-x" aria-label="Cerrar">&times;</button></div>'+
      '<div class="mv-stage"><img alt=""></div>';
    document.body.appendChild(visor);
    stage = visor.querySelector('.mv-stage');
    imgEl = visor.querySelector('img');
    titleEl = visor.querySelector('.mv-title');
    openEl = visor.querySelector('.mv-open');
    zoomBtn = visor.querySelector('.mv-zoom');
    visor.querySelector('.mv-x').addEventListener('click', closeVisor);
    zoomBtn.addEventListener('click', toggleZoom);
    imgEl.addEventListener('click', toggleZoom);
    stage.addEventListener('click', function(e){ if(e.target === stage) closeVisor(); });
  }
  function toggleZoom(){
    var z = visor.classList.toggle('zoom');
    zoomBtn.textContent = z ? 'Ajustar' : 'Ampliar';
  }
  function openVisor(slug, nombre){
    if(!visor) build();
    visor.classList.remove('zoom');
    zoomBtn.textContent = 'Ampliar';
    titleEl.textContent = 'Mapa parlante — ' + nombre;
    imgEl.alt = 'Mapa parlante de ' + nombre;
    imgEl.removeAttribute('src');
    imgEl.src = 'mapas/' + slug + '.jpg';
    openEl.href = 'mapas/' + slug + '.jpg';
    (document.fullscreenElement || document.body).appendChild(visor); visor.classList.add('on');
    document.body.style.overflow = 'hidden';
  }
  function closeVisor(){
    if(!visor) return;
    visor.classList.remove('on');
    document.body.style.overflow = '';
  }
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape' && visor && visor.classList.contains('on')) closeVisor();
  });
  map.on('popupopen', function(e){
    var root = e.popup.getElement ? e.popup.getElement() : e.popup._container;
    var a = root && root.querySelector('a[data-mapa]');
    if(!a) return;
    a.addEventListener('click', function(ev){
      ev.preventDefault();
      openVisor(a.getAttribute('data-mapa'), a.getAttribute('data-nombre'));
    });
  });
})();
// Informes por pueblo: se completan solo si el dato no trae "Mayor información"
var INFORMES_PUEBLOS = {
  'Araona': 'https://iiali.org/wp-content/uploads/2024/12/2Araona.pdf'
  // 'Nombre del pueblo': 'https://iiali.org/wp-content/uploads/.../archivo.pdf',
};
ATLAS_DATA.pueblos.forEach(function(p){
  var u = INFORMES_PUEBLOS[p.name];
  if(u && !(p.props['Mayor información'] || '').trim()){
    p.props['Mayor información'] = 'Informe: ' + u;
  }
});
// Informes por pueblo (enlaces actualizados). Cada fila: [palabras del nombre, archivo en iiali.org]
var INFORMES_BASE = 'https://iiali.org/wp-content/uploads/2024/12/';
var INFORMES_PUEBLOS = [
  [['araona'], '2Araona.pdf'],
  [['baure','baures'], '3Baure.pdf'],
  [['cavineno'], '4Cavineno.pdf'],
  [['cayubaba'], '5Cayubaba.pdf'],
  [['chacobo'], '6Chacobo.pdf'],
  [['ejja','eja'], '7-Ese-Ejja_opt.pdf'],
  [['itonama'], '8-Itonama.pdf'],
  [['joaquiniano'], '9.Joaquiniano.pdf'],
  [['canichana','kanichana'], '10kanichana.pdf'],
  [['machineri'], '11Machineri.pdf'],
  [['maropa'], '12Maropa.pdf'],
  [['more'], '13More.pdf'],
  [['moseten','mosetene'], '14-Moseten.pdf'],
  [['movima'], '15Movima.pdf'],
  [['ignaciano'], '16-MoxenoIgnaciano.pdf'],
  [['trinitario'], '17Moxeno-trinitario.pdf'],
  [['pacahuara'], '18Pacahuara.pdf'],
  [['siriono'], '19Siriono.pdf'],
  [['takana','tacana'], '20Takana.pdf'],
  [['tsimane','chimane'], '21Tsimane_opt.pdf'],
  [['yaminawa','yaminahua'], '22-Yaminawa_opt.pdf'],
  [['yuqui','yuki'], '23Yuki.pdf'],
  [['yurakare'], '24Yurakare_opt.pdf']
];
ATLAS_DATA.pueblos.forEach(function(p){
  var palabras = fotoSlug(p.name).split('-');
  INFORMES_PUEBLOS.some(function(fila){
    var hit = fila[0].some(function(w){ return palabras.indexOf(w) !== -1; });
    if(hit){ p.props['Mayor información'] = 'Informe: ' + INFORMES_BASE + fila[1]; }
    return hit;
  });
});
// Datos 2024 por pueblo: autoidentificación y número de hablantes (reemplazan a los de 2012)
var PUEBLOS_2024 = [
  [['ejja','eja'], 1927, 1382],
  [['tsimane','chimane'], 22343, 18909],
  [['araona'], 147, 114],
  [['yaminawa','yaminahua'], 228, 112],
  [['yuqui','yuki'], 478, 266],
  [['chacobo'], 1530, 1364],
  [['moseten','mosetene'], 4099, 792],
  [['ignaciano'], 9076, 286],
  [['siriono'], 722, 69],
  [['movima'], 10654, 173],
  [['trinitario'], 14457, 1442],
  [['takana','tacana'], 19350, 578],
  [['yurakare'], 6480, 849],
  [['baure','baures'], 1618, 10],
  [['cavineno'], 5344, 973],
  [['machineri'], 72, 12],
  [['pacahuara'], 70, 30],
  [['itonama'], 5612, 35],
  [['maropa'], 'Reyesano: 106 personas ; Maropa: 2.797 personas', 26],
  [['more'], 212, 10],
  [['canichana','kanichana'], 865, 8],
  [['cayubaba'], 1064, 5],
  [['joaquiniano'], 1992, 7]
];
function txt2024(v){
  var s = (typeof v === 'number') ? (String(v).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' personas') : v;
  return s + ' - Censo 2024';
}
ATLAS_DATA.pueblos.forEach(function(p){
  var palabras = fotoSlug(p.name).split('-');
  PUEBLOS_2024.some(function(fila){
    var hit = fila[0].some(function(w){ return palabras.indexOf(w) !== -1; });
    if(hit){
      p.props['Auto identificación'] = txt2024(fila[1]);
      p.props['Número de hablantes'] = p.props['Número de hablantes '] = txt2024(fila[2]);
    }
    return hit;
  });
});
// Regiones geoculturales: descripción de cada región (textos de My Maps, corregidos)
var TEXTOS_REGIONES = [
  ['amazonia', 'La Amazonía boliviana constituye el área geocultural más extendida y diversa de Bolivia. Alberga al más alto número de lenguas y Pueblos Indígenas del país (23). Se extiende hacia el noreste a territorios que forman parte del Brasil y hacia el noroeste a territorios que conforman la Amazonía peruana. Por el sur colinda con el Oriente boliviano y Trópico de Cochabamba, y por el oeste con el Norte del departamento de La Paz.'],
  ['oriente', 'El área geocultural de Oriente boliviano se refiere a aquella región de planicies y humedales ubicada entre la Amazonía y el Chaco. Comprende sobre todo parte del departamento de Santa Cruz. En esta región viven los pueblos Ayoreo, Chiquitano y Guarayo y se hablan las lenguas ayoreo, besïro o chiquitano y guarayo. En su día en esta región se habló también el guarasugwe, y probablemente otras lenguas indígenas más. Estos Pueblos e idiomas no forman parte del Atlas digital.'],
  ['chaco', 'El área geocultural del Chaco boliviano es la más austral; se sitúa entre el Oriente y la subregión Altiplano-Valles. Se vincula con la región del Gran Chaco que comprende otras subáreas geoculturales hoy parte de Brasil, Paraguay y Argentina. En el Chaco boliviano habitan los pueblos Guaraní, Tapieté y Weenhayek con sus correspondientes idiomas que llevan los mismos nombres. Estos Pueblos e idiomas no forman parte de este Atlas digital.'],
  ['altiplano', 'El área geocultural Altiplano-Valles comprende los valles interandinos, las zonas de puna, las mesetas altiplánicas y también el pie de monte o yungas occidentales. Se extiende en parte de los departamentos de Cochabamba, La Paz y Tarija, y el área total de los departamentos de Oruro y Potosí. En este vasto territorio habitan sobre todo los pueblos Aymara, Quechua y también Leco, Kallawaya y Uru con sus respectivos idiomas. En su día en esta región se habló el pukina. Estos Pueblos e idiomas no forman parte de este Atlas digital.']
];
ATLAS_DATA.regiones.forEach(function(r){
  var n = norm(r.name);
  TEXTOS_REGIONES.some(function(fila){
    var hit = n.indexOf(fila[0]) !== -1;
    if(hit){ r.props['Atlas Digital'] = fila[1]; }
    return hit;
  });
  if(n.indexOf('amazonia') !== -1){
    
  }
});
// Subregiones de la Amazonía: descripción de cada subregión (textos de My Maps)
var TEXTOS_SUBREGIONES = [
  ['norte amazonico', 'Esta subregión abarca el departamento de Pando y el norte del departamento de Beni. Al norte del departamento de Pando, los límites están definidos por los ríos Acre, Abuná y Chipamanu, como fronteras naturales con Brasil. Al este también colinda con Brasil, teniendo como límites naturales los ríos Madera y Mamoré. Al sur, el límite con las llanuras del departamento de Beni se establece a través del curso de los ríos Yata y Biata. Finalmente, al oeste limita con el departamento de La Paz a través del río Madre de Dios y también con Perú.'],
  ['amazonia sur', 'Esta subregión comprende la mayor parte del departamento de Beni, el más lingüísticamente diverso de Bolivia. También abarca una pequeña área al norte del departamento de Santa Cruz. Al norte limita con el departamento de Pando y el área norte del departamento de Beni mediante el curso de los ríos Yata y Biata. Al este con Brasil, con frontera natural mediante el río Iténez, al sur con el Chaco boliviano y Oriente (Bosque seco chiquitano) del departamento de Santa Cruz. Por último, el límite al oeste corresponde con el departamento de La Paz definido por los ríos Beni y Quiquibey, y con el departamento de Cochabamba por medio de los ríos Ichilo, parte del Mamoré y la frontera política interdepartamental.'],
  ['norte de la paz', 'Como su nombre lo indica, esta subregión se ubica en el departamento de La Paz, en la provincia Abel Iturralde. Limita al norte con el departamento de Pando, teniendo como frontera natural el río Madre de Dios y el límite político interdepartamental, al este con el departamento de Beni mediante los ríos Beni y Quiquibey y con el departamento de Cochabamba a través del río Cotacajes. Al sur con la faja sub-andina de bosques amazónicos de la región de Yungas y finalmente al oeste con Perú, facilitando el curso del río Heath como frontera natural.'],
  ['tropico de cochabamba', 'Esta subregión comprende las provincias Chapare y Carrasco, al norte del departamento de Cochabamba. Su ubicación colinda al norte con el departamento de Beni a través del límite interdepartamental, al este con el departamento de Santa Cruz por medio de los ríos Ichilo y Mamoré, al sur con la faja sub-andina de bosques amazónicos de Cochabamba y al oeste con el departamento de La Paz mediante el río Cotacajes.']
];
ATLAS_DATA.subregiones.forEach(function(r){
  var n = norm(r.name);
  TEXTOS_SUBREGIONES.some(function(fila){
    var hit = n.indexOf(fila[0]) !== -1;
    if(hit){ r.props['Atlas Digital'] = fila[1]; }
    return hit;
  });
});
// Resalte al seleccionar un polígono: foco (atenúa el resto), resplandor dorado y pulso breve
(function(){
  var st = document.createElement('style');
  st.textContent =
    '.atlas-dim{fill-opacity:.10 !important;stroke-opacity:.35 !important;transition:fill-opacity .4s,stroke-opacity .4s;}'+
    '.atlas-sel{stroke:#FFD54F !important;stroke-opacity:1 !important;fill-opacity:.7 !important;stroke-width:4px;filter:drop-shadow(0 0 8px rgba(255,196,50,.95));animation:atlasPulse 1.5s ease-out 1;}'+
    '@keyframes atlasPulse{0%{stroke-width:14px;filter:drop-shadow(0 0 26px rgba(255,196,50,1));}100%{stroke-width:4px;filter:drop-shadow(0 0 8px rgba(255,196,50,.95));}}';
  document.head.appendChild(st);

  var seleccion = null;
  function limpiar(){
    if(!seleccion) return;
    seleccion.def.group.eachLayer(function(gl){
      gl.eachLayer(function(l){
        var el = l.getElement && l.getElement();
        if(el){ el.classList.remove('atlas-dim', 'atlas-sel'); }
      });
    });
    seleccion = null;
  }
  map.on('popupopen', function(e){
    limpiar();
    var src = e.popup._source;
    if(!src) return;
    layerDefs.forEach(function(def){
      if(def.type !== 'polygon') return;
      def.group.eachLayer(function(gl){
        if(gl.hasLayer && gl.hasLayer(src)){ seleccion = { def: def, gl: gl }; }
      });
    });
    if(!seleccion) return;
    seleccion.def.group.eachLayer(function(gl){
      gl.eachLayer(function(l){
        var el = l.getElement && l.getElement();
        if(!el) return;
        if(gl === seleccion.gl){
          if(l.bringToFront){ l.bringToFront(); }
          el.classList.add('atlas-sel');
        } else {
          el.classList.add('atlas-dim');
        }
      });
    });
  });
  map.on('popupclose', limpiar);
})();
// Lista de Pueblos agrupada por nivel de vitalidad (como My Maps y el documento metodológico)
(function(){
  var def = layerDefs.filter(function(d){ return d.key === 'pueblos'; })[0];
  var chk = document.getElementById('chk-pueblos');
  if(!def || !chk) return;
  var sub = chk.parentNode.nextElementSibling;
  if(!sub || !sub.classList.contains('layer-sub')) return;

  var st = document.createElement('style');
  st.textContent =
    '.vit-head{position:relative;display:flex;align-items:center;gap:8px;padding:8px 8px 8px 16px;margin-top:10px;font-weight:700;font-size:13px;cursor:pointer;border-radius:4px;background:#EFEAE0;border-bottom:1px solid rgba(0,0,0,.08);}.vit-head::before{content:"";position:absolute;left:0;top:0;bottom:0;width:6px;border-radius:4px 0 0 4px;background:var(--vit-bar,#999);}'+
    '.vit-head:hover{background:#E6DFD0;}'+
    '.vit-head.on{background:rgba(149,28,35,.12);}'+
    '.vit-sw{width:16px;height:16px;border-radius:50%;flex:none;box-shadow:0 0 0 2px #fff,0 0 0 3px rgba(0,0,0,.2);}'+
    '.vit-n{margin-left:auto;font-weight:400;color:#8a8474;font-size:12px;}'+
    '.vit-item{display:flex;align-items:center;gap:8px;padding-left:26px;}'+
    '.vit-dot{width:11px;height:11px;border-radius:50%;flex:none;}';
  document.head.appendChild(st);

  function gradoOf(item){
    return gradoCanon(item.props['Grado de vitalidad'] || item.props['Grado de vitalidad de la lengua'] || '');
  }
  var porNivel = {};
  GRADO_ORDER.forEach(function(g){ porNivel[g] = []; });
  var otros = [];
  ATLAS_DATA.pueblos.forEach(function(it){
    var g = gradoOf(it);
    if(porNivel[g]){ porNivel[g].push(it); } else { otros.push(it); }
  });

  sub.innerHTML = '';
  var heads = [], dots = [], activo = null;

  function limpiarFiltro(){
    def.group.eachLayer(function(gl){
      gl.eachLayer(function(l){
        var el = l.getElement && l.getElement();
        if(el){ el.classList.remove('atlas-dim'); }
      });
    });
    heads.forEach(function(h){ h.classList.remove('on'); });
    activo = null;
  }
  function aislar(g, head){
    if(activo === g){ limpiarFiltro(); return; }
    limpiarFiltro();
    if(!map.hasLayer(def.group)){ def.group.addTo(map); chk.checked = true; }
    activo = g;
    head.classList.add('on');
    var match = [];
    def.group.eachLayer(function(gl){
      var ok = gl._atlasItem && gradoOf(gl._atlasItem) === g;
      if(ok){ match.push(gl); return; }
      gl.eachLayer(function(l){
        var el = l.getElement && l.getElement();
        if(el){ el.classList.add('atlas-dim'); }
      });
    });
    if(match.length){ map.flyToBounds(L.featureGroup(match).getBounds(), { maxZoom: 8, duration: 1 }); }
  }

  function agregarGrupo(g, etiqueta, grupo, color){
    var head = document.createElement('div');
    head.className = 'vit-head'; head.style.setProperty('--vit-bar', color);
    head.title = 'Ver solo los pueblos de este nivel';
    head.innerHTML = '<span class="vit-sw" style="background:'+color+';"></span><span>'+escapeHtml(etiqueta)+'</span><span class="vit-n">'+grupo.length+'</span>';
    head.addEventListener('click', function(){ aislar(g, head); });
    heads.push(head);
    sub.appendChild(head);
    grupo.slice().sort(function(a,b){ return a.name.localeCompare(b.name); }).forEach(function(item){
      var li = document.createElement('div');
      li.className = 'layer-sub-item vit-item';
      var dot = document.createElement('span');
      dot.className = 'vit-dot';
      li.appendChild(dot);
      li.appendChild(document.createTextNode(item.name));
      dots.push({ el: dot, item: item });
      li.addEventListener('click', function(){ zoomToItem(def, item); });
      sub.appendChild(li);
    });
  }

  GRADO_ORDER.forEach(function(g){
    var grupo = porNivel[g];
    if(!grupo.length) return;
    var color = (ATLAS_DATA.grado_color && ATLAS_DATA.grado_color[g]) || grupo[0].color_vitalidad || '#999999';
    agregarGrupo(g, GRADO_LABELS[g], grupo, fondoNivel(g, color));
  });
  if(otros.length){ agregarGrupo('__otros__', 'Sin clasificar', otros, '#999999'); }

  function pintar(){
    dots.forEach(function(d){
      d.el.style.background = colorMode === 'vitalidad' ? fondoNivel(gradoOf(d.item), d.item.color_vitalidad || '#999999') : (d.item.color_pueblo || '#999999');
    });
  }
  pintar();
  document.querySelectorAll('#color-mode-toggle button').forEach(function(b){ b.addEventListener('click', pintar); });
})();
// Niveles intermedios de vitalidad en bicolor (solo en la barra lateral: lista de Pueblos y leyenda)
var NIVELES_BICOLOR = {
  'entre vulnerable y en peligro': ['vulnerable', 'en peligro'],
  'entre en peligro y seriamente en peligro': ['en peligro', 'seriamente en peligro'],
  'entre seriamente en peligro y situacion critica': ['seriamente en peligro', 'situacion critica'],
  'entre situacion critica y extinta': ['situacion critica', 'extinto']
};
function fondoNivel(g, colorBase){
  var par = ({'entre vulnerable y en peligro':['vulnerable','en peligro'],'entre en peligro y seriamente en peligro':['en peligro','seriamente en peligro'],'entre seriamente en peligro y situacion critica':['seriamente en peligro','situacion critica'],'entre situacion critica y extinta':['situacion critica','extinto']})[g];
  var gc = ATLAS_DATA.grado_color || {};
  if(!par || !gc[par[0]] || !gc[par[1]]) return colorBase;
  return 'linear-gradient(135deg, ' + gc[par[0]] + ' 50%, ' + gc[par[1]] + ' 50%)';
}
(function(){
  var box = document.getElementById('legend-box');
  if(!box) return;
  function aplicar(){
    var porEtiqueta = {};
    Object.keys(GRADO_LABELS).forEach(function(g){ porEtiqueta[GRADO_LABELS[g]] = g; });
    box.querySelectorAll('.legend-row').forEach(function(row){
      var g = porEtiqueta[row.textContent.trim()];
      var dot = row.querySelector('.legend-dot');
      if(g && dot && NIVELES_BICOLOR[g]){ dot.style.background = fondoNivel(g, dot.style.backgroundColor); }
    });
  }
  aplicar();
  new MutationObserver(aplicar).observe(box, { childList: true });
})();
// Comunidades focalizadas: lista agrupada por nivel de vitalidad + puntos bicolor en el mapa
(function(){
  var def = layerDefs.filter(function(d){ return d.key === 'comunidades'; })[0];
  var chk = document.getElementById('chk-comunidades');
  if(!def || !chk) return;
  var sub = chk.parentNode.nextElementSibling;
  if(!sub || !sub.classList.contains('layer-sub')) return;

  function gradoOf(item){
    return gradoCanon(item.props['Grado de vitalidad'] || item.props['Grado de vitalidad de la lengua'] || '');
  }

  // ---------- Lista lateral ----------
  var porNivel = {};
  GRADO_ORDER.forEach(function(g){ porNivel[g] = []; });
  var otros = [];
  ATLAS_DATA.comunidades.forEach(function(it){
    var g = gradoOf(it);
    if(porNivel[g]){ porNivel[g].push(it); } else { otros.push(it); }
  });

  sub.innerHTML = '';
  var heads = [], dots = [], activo = null;

  function limpiarFiltro(){
    def.group.eachLayer(function(m){
      var el = m.getElement && m.getElement();
      if(el){ el.classList.remove('atlas-dim'); }
    });
    heads.forEach(function(h){ h.classList.remove('on'); });
    activo = null;
  }
  function aislar(g, head){
    if(activo === g){ limpiarFiltro(); return; }
    limpiarFiltro();
    if(!map.hasLayer(def.group)){ def.group.addTo(map); chk.checked = true; }
    activo = g;
    head.classList.add('on');
    var match = [];
    def.group.eachLayer(function(m){
      var ok = m._atlasItem && gradoOf(m._atlasItem) === g;
      if(ok){ match.push(m); return; }
      var el = m.getElement && m.getElement();
      if(el){ el.classList.add('atlas-dim'); }
    });
    if(match.length){ map.flyToBounds(L.featureGroup(match).getBounds(), { maxZoom: 9, duration: 1 }); }
  }

  function agregarGrupo(g, etiqueta, grupo, fondo){
    var head = document.createElement('div');
    head.className = 'vit-head'; head.style.setProperty('--vit-bar', fondo);
    head.title = 'Ver solo las comunidades de este nivel';
    head.innerHTML = '<span class="vit-sw" style="background:'+fondo+';"></span><span>'+escapeHtml(etiqueta)+'</span><span class="vit-n">'+grupo.length+'</span>';
    head.addEventListener('click', function(){ aislar(g, head); });
    heads.push(head);
    sub.appendChild(head);
    grupo.slice().sort(function(a,b){ return a.name.localeCompare(b.name); }).forEach(function(item){
      var li = document.createElement('div');
      li.className = 'layer-sub-item vit-item';
      var dot = document.createElement('span');
      dot.className = 'vit-dot';
      li.appendChild(dot);
      li.appendChild(document.createTextNode(item.name));
      dots.push({ el: dot, item: item });
      li.addEventListener('click', function(){ zoomToItem(def, item); });
      sub.appendChild(li);
    });
  }

  GRADO_ORDER.forEach(function(g){
    var grupo = porNivel[g];
    if(!grupo.length) return;
    var color = (ATLAS_DATA.grado_color && ATLAS_DATA.grado_color[g]) || grupo[0].color_vitalidad || '#999999';
    agregarGrupo(g, GRADO_LABELS[g], grupo, fondoNivel(g, color));
  });
  if(otros.length){ agregarGrupo('__otros__', 'Sin clasificar', otros, '#999999'); }

  function pintarLista(){
    dots.forEach(function(d){
      d.el.style.background = colorMode === 'vitalidad' ? fondoNivel(gradoOf(d.item), d.item.color_vitalidad || '#999999') : (d.item.color_pueblo || '#999999');
    });
  }

  // ---------- Puntos del mapa en bicolor ----------
  var PARES = {
    'entre vulnerable y en peligro': ['vulnerable', 'en peligro'],
    'entre en peligro y seriamente en peligro': ['en peligro', 'seriamente en peligro'],
    'entre seriamente en peligro y situacion critica': ['seriamente en peligro', 'situacion critica'],
    'entre situacion critica y extinta': ['situacion critica', 'extinto']
  };
  var RADIO = 8;
  var NS = 'http://www.w3.org/2000/svg';
  var svg = map.getPane('overlayPane').querySelector('svg');
  var defs = null, hechos = {};
  if(svg){
    defs = document.createElementNS(NS, 'defs');
    svg.insertBefore(defs, svg.firstChild);
  }
  function gradienteId(g){
    var par = PARES[g], gc = ATLAS_DATA.grado_color || {};
    if(!defs || !par || !gc[par[0]] || !gc[par[1]]) return null;
    var id = 'bic-' + g.replace(/[^a-z]+/g, '-');
    if(!hechos[id]){
      var lg = document.createElementNS(NS, 'linearGradient');
      lg.setAttribute('id', id);
      lg.setAttribute('x1', '0'); lg.setAttribute('y1', '0');
      lg.setAttribute('x2', '1'); lg.setAttribute('y2', '1');
      [[0, par[0]], [0.5, par[0]], [0.5, par[1]], [1, par[1]]].forEach(function(s){
        var stop = document.createElementNS(NS, 'stop');
        stop.setAttribute('offset', s[0]);
        stop.setAttribute('stop-color', gc[s[1]]);
        lg.appendChild(stop);
      });
      defs.appendChild(lg);
      hechos[id] = true;
    }
    return 'url(#' + id + ')';
  }
  function pintarMapa(){
    def.group.eachLayer(function(m){
      var it = m._atlasItem;
      if(!it) return;
      var relleno = colorMode === 'vitalidad' ? gradienteId(gradoOf(it)) : null;
      m.setStyle({ fillColor: relleno || styleColorOf(it, true) });
      if(m.setRadius){ m.setRadius(RADIO); }
    });
  }

  pintarLista();
  pintarMapa();
  document.querySelectorAll('#color-mode-toggle button').forEach(function(b){
    b.addEventListener('click', function(){ pintarLista(); pintarMapa(); });
  });
})();
// Reconoce variantes de escritura del grado de vitalidad y devuelve la clave de GRADO_ORDER
function gradoCanon(texto){
  function canon(s){ return norm(s).replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/extinto|silenciada/g, 'extinta').replace(/extinta o extinta/g, 'extinta'); }
  var t = canon(texto), exacta = '', prefijo = '';
  if(!t) return '';
  GRADO_ORDER.forEach(function(g){
    var c = canon(g);
    if(t === c){ exacta = g; }
    else if(t.indexOf(c + ' ') === 0 && c.length > canon(prefijo).length){ prefijo = g; }
  });
  if(exacta) return exacta;
  if(prefijo) return prefijo;
  if(/^silenciada( o extinta)?$/.test(t)) return 'extinto';
  return norm(texto);
}
// Botón de pantalla completa: amplía todo el geoportal (mapa + barra lateral de capas)
(function(){
  var chk = document.getElementById('chk-pueblos');
  var mapEl = map.getContainer();
  if(!chk) return;
  var cont = mapEl;
  while(cont && !cont.contains(chk)){ cont = cont.parentNode; }
  if(!cont || cont === document.body || cont === document.documentElement) return;
  var sideEl = chk;
  while(sideEl && sideEl.parentNode !== cont){ sideEl = sideEl.parentNode; }
  var mapPart = mapEl;
  while(mapPart && mapPart.parentNode !== cont){ mapPart = mapPart.parentNode; }

  var st = document.createElement('style');
  st.textContent =
    '.atlas-fs-on{position:fixed !important;top:0;left:0;right:0;bottom:0;width:100vw !important;height:100vh !important;max-width:none !important;max-height:none !important;margin:0 !important;padding:0 !important;z-index:9999;display:flex !important;flex-direction:row;background:#FBF8F1;}'+
    '.atlas-fs-on > :not(.atlas-fs-side):not(.atlas-fs-map){display:none !important;}'+
    '.atlas-fs-on .atlas-fs-side{flex:0 0 auto;height:100vh !important;max-height:100vh !important;overflow-y:auto;}'+
    '.atlas-fs-on .atlas-fs-map{flex:1 1 auto;min-width:0;height:100vh !important;}'+
    '@media (max-width:760px){'+
      '.atlas-fs-on{flex-direction:column;}'+
      '.atlas-fs-on .atlas-fs-side{width:100% !important;height:38vh !important;max-height:38vh !important;}'+
      '.atlas-fs-on .atlas-fs-map{flex:1 1 0;height:auto !important;min-height:0;}'+
    '}'+
    '.atlas-fs-btn a{display:flex !important;align-items:center;justify-content:center;}';
  document.head.appendChild(st);

  var ICON_EXPAND = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
  var ICON_COMPRESS = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>';

  var btn = null, activo = false, pseudo = false, guardado = {};

  function entrar(simulada){
    if(activo) return;
    activo = true; pseudo = !!simulada;
    guardado.ancho = sideEl.style.width;
    guardado.flex = sideEl.style.flex;
    guardado.alto = mapEl.style.height;
    var ancho = sideEl.getBoundingClientRect().width;
    sideEl.style.width = ancho + 'px';
    sideEl.style.flex = '0 0 auto';
    cont.classList.add('atlas-fs-on');
    sideEl.classList.add('atlas-fs-side');
    mapPart.classList.add('atlas-fs-map');
    mapEl.style.height = '100%';
    if(pseudo){ document.body.style.overflow = 'hidden'; }
    btn.innerHTML = ICON_COMPRESS;
    btn.title = 'Salir de pantalla completa';
    setTimeout(function(){ map.invalidateSize(); }, 150);
  }
  function salir(){
    if(!activo) return;
    activo = false;
    cont.classList.remove('atlas-fs-on');
    sideEl.classList.remove('atlas-fs-side');
    mapPart.classList.remove('atlas-fs-map');
    sideEl.style.width = guardado.ancho || '';
    sideEl.style.flex = guardado.flex || '';
    mapEl.style.height = guardado.alto || '';
    document.body.style.overflow = '';
    btn.innerHTML = ICON_EXPAND;
    btn.title = 'Pantalla completa';
    setTimeout(function(){ map.invalidateSize(); }, 150);
  }
  function alternar(){
    if(!activo){
      var pedir = cont.requestFullscreen || cont.webkitRequestFullscreen;
      if(pedir){
        try {
          var r = pedir.call(cont);
          if(r && r.catch){ r.catch(function(){ entrar(true); }); }
        } catch(e){ entrar(true); }
      } else {
        entrar(true);
      }
    } else if(document.fullscreenElement || document.webkitFullscreenElement){
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else {
      salir();
    }
  }
  function alCambiar(){
    var fs = document.fullscreenElement || document.webkitFullscreenElement;
    if(fs === cont){ entrar(false); }
    else if(activo && !pseudo){ salir(); }
  }
  document.addEventListener('fullscreenchange', alCambiar);
  document.addEventListener('webkitfullscreenchange', alCambiar);
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape' && activo && pseudo){ salir(); }
  });

  var Control = L.Control.extend({
    options: { position: 'topleft' },
    onAdd: function(){
      var bar = L.DomUtil.create('div', 'leaflet-bar atlas-fs-btn');
      btn = L.DomUtil.create('a', '', bar);
      btn.href = '#';
      btn.setAttribute('role', 'button');
      btn.setAttribute('aria-label', 'Pantalla completa');
      btn.title = 'Pantalla completa';
      btn.innerHTML = ICON_EXPAND;
      L.DomEvent.disableClickPropagation(bar);
      L.DomEvent.on(btn, 'click', function(e){ L.DomEvent.preventDefault(e); alternar(); });
      return bar;
    }
  });
  new Control().addTo(map);
})();
// Herramienta "Mi ubicación" (GPS): punto de la persona que navega + círculo de precisión
(function(){
  if(!navigator.geolocation) return;

  var st = document.createElement('style');
  st.textContent =
    '.atlas-geo-btn a{display:flex !important;align-items:center;justify-content:center;}'+
    '.atlas-geo-btn a.on{background:#951C23;color:#fff;}'+
    '.atlas-geo-btn a.busy svg{animation:atlasGeoSpin 1.1s linear infinite;}'+
    '@keyframes atlasGeoSpin{to{transform:rotate(360deg);}}'+
    '.atlas-geo-icon{background:none;border:0;}'+
    '.atlas-geo-dot{position:relative;width:22px;height:22px;}'+
    '.atlas-geo-core{position:absolute;left:3px;top:3px;width:16px;height:16px;border-radius:50%;background:#1A73E8;border:3px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.45);box-sizing:border-box;}'+
    '.atlas-geo-pulse{position:absolute;left:3px;top:3px;width:16px;height:16px;border-radius:50%;background:rgba(26,115,232,.45);animation:atlasGeoPulse 2s ease-out infinite;}'+
    '@keyframes atlasGeoPulse{0%{transform:scale(1);opacity:.8;}100%{transform:scale(3.2);opacity:0;}}'+
    '.atlas-geo-msg{position:absolute;left:50%;top:12px;transform:translateX(-50%);z-index:1000;max-width:min(88%,420px);background:rgba(43,43,43,.92);color:#fff;font-size:13px;line-height:1.4;padding:9px 14px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.3);display:none;text-align:center;}'+
    '.atlas-geo-msg.show{display:block;}';
  document.head.appendChild(st);

  var ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><path d="M12 2v3.5M12 18.5V22M2 12h3.5M18.5 12H22"/></svg>';
  var btn = null, marker = null, circle = null, ultimo = null;
  var estado = 'off', primera = true, msgEl = null, msgTimer = null;

  function aviso(texto, ms){
    if(!msgEl){ msgEl = L.DomUtil.create('div', 'atlas-geo-msg', map.getContainer()); }
    msgEl.textContent = texto;
    msgEl.classList.add('show');
    clearTimeout(msgTimer);
    if(ms){ msgTimer = setTimeout(function(){ msgEl.classList.remove('show'); }, ms); }
  }
  function ocultarAviso(){
    clearTimeout(msgTimer);
    if(msgEl){ msgEl.classList.remove('show'); }
  }
  function marcar(e){
    estado = e;
    btn.classList.toggle('on', e === 'activo');
    btn.classList.toggle('busy', e === 'buscando');
    btn.title = e === 'off' ? 'Mi ubicación' : 'Dejar de mostrar mi ubicación';
  }
  function precision(m){ return '±' + metersToText(m).replace('.', ','); }
  function contenido(e){
    return '<b>Tu ubicación</b><br>Precisión aproximada: ' + precision(e.accuracy) +
      '<br>Coordenadas: ' + e.latlng.lat.toFixed(5) + ', ' + e.latlng.lng.toFixed(5);
  }

  function iniciar(){
    if(window.isSecureContext === false){
      aviso('La ubicación solo funciona en páginas seguras (https).', 6000);
      return;
    }
    primera = true;
    marcar('buscando');
    aviso('Buscando tu ubicación… acepta el permiso cuando el navegador lo pida.');
    map.locate({ watch: true, setView: false, enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  }
  function detener(){
    map.stopLocate();
    if(marker){ map.removeLayer(marker); marker = null; }
    if(circle){ map.removeLayer(circle); circle = null; }
    ultimo = null;
    marcar('off');
    ocultarAviso();
  }

  map.on('locationfound', function(e){
    if(estado === 'off') return;
    ultimo = e;
    if(!marker){
      circle = L.circle(e.latlng, { radius: e.accuracy, color: '#1A73E8', weight: 1, fillColor: '#1A73E8', fillOpacity: 0.12, interactive: false }).addTo(map);
      marker = L.marker(e.latlng, {
        icon: L.divIcon({ className: 'atlas-geo-icon', html: '<div class="atlas-geo-dot"><span class="atlas-geo-pulse"></span><span class="atlas-geo-core"></span></div>', iconSize: [22, 22], iconAnchor: [11, 11] }),
        keyboard: false, zIndexOffset: 1000
      }).addTo(map);
      marker.bindPopup(function(){ return ultimo ? contenido(ultimo) : ''; });
    } else {
      marker.setLatLng(e.latlng);
      circle.setLatLng(e.latlng);
      circle.setRadius(e.accuracy);
      if(marker.isPopupOpen()){ marker.getPopup().update(); }
    }
    if(primera){
      primera = false;
      marcar('activo');
      map.flyToBounds(circle.getBounds(), { maxZoom: 14, duration: 1.2 });
      aviso(e.accuracy > 5000
        ? 'Ubicación aproximada (' + precision(e.accuracy) + '). Con el GPS activado y al aire libre se obtiene mayor precisión.'
        : 'Estás aquí. Toca el punto azul para ver las coordenadas.', 6000);
    }
  });

  map.on('locationerror', function(e){
    if(estado === 'off') return;
    if(marker && e.code !== 1){
      aviso('Se perdió la señal de ubicación. Seguimos intentando…', 4000);
      return;
    }
    var texto = e.code === 1
      ? 'No se pudo acceder a tu ubicación. Permite el acceso a la ubicación para este sitio en la configuración del navegador y vuelve a intentar.'
      : (e.code === 2
        ? 'No se pudo determinar tu ubicación. Revisa que el GPS o la ubicación del dispositivo estén activados.'
        : 'La ubicación tardó demasiado. Intenta de nuevo, de preferencia al aire libre.');
    detener();
    aviso(texto, 9000);
  });

  var Control = L.Control.extend({
    options: { position: 'topleft' },
    onAdd: function(){
      var bar = L.DomUtil.create('div', 'leaflet-bar atlas-geo-btn');
      btn = L.DomUtil.create('a', '', bar);
      btn.href = '#';
      btn.setAttribute('role', 'button');
      btn.setAttribute('aria-label', 'Mi ubicación');
      btn.title = 'Mi ubicación';
      btn.innerHTML = ICON;
      L.DomEvent.disableClickPropagation(bar);
      L.DomEvent.on(btn, 'click', function(ev){
        L.DomEvent.preventDefault(ev);
        if(estado === 'off'){ iniciar(); } else { detener(); }
      });
      return bar;
    }
  });
  new Control().addTo(map);
})();
// Grado "extinto" → "silenciada" en los popups de Pueblos y Comunidades focalizadas
['pueblos', 'comunidades'].forEach(function(k){
  ATLAS_DATA[k].forEach(function(it){
    ['Grado de vitalidad', 'Grado de vitalidad de la lengua'].forEach(function(campo){
      var v = it.props[campo];
      if(!v) return;
      var g = gradoCanon(v);
      if(g === 'extinto'){ it.props[campo] = 'Silenciada'; }
      else if(g === 'entre situacion critica y extinta'){ it.props[campo] = 'Entre situación crítica y silenciada'; }
    });
  });
});
// IIALI
(function(){
  var raw = refs['INSTITUTO IBEROAMERICANO DE LENGUAS INDÍGENAS'] || '';
  raw = raw.replace(/<img[^>]*>/,'').replace(/nombre:\s*INSTITUTO[\s\S]*$/,'').trim();
  var lines = raw.split('<br>');
  var html = '';
  var pendingList = [];
  function flushList(){
    if(pendingList.length){
      html += '<ul>' + pendingList.map(function(t){return '<li>'+t+'</li>';}).join('') + '</ul>';
      pendingList = [];
    }
  }
  lines.forEach(function(line){
    line = line.replace(/\u00a0/g,' ').trim();
    if(!line) return;
    if(line.indexOf('¿') === 0){
      flushList();
      html += '<h4 style="margin:14px 0 4px;color:var(--verde-selva);">'+line+'</h4>';
    } else if(line.indexOf('•') === 0 || /^\d+\.\s*/.test(line)){
      pendingList.push(line.replace(/^•\s*/,'').replace(/^\d+\.\s*/,'').trim());
    } else if(line.indexOf('http') === 0){
      flushList();
      html += '<p><a href="'+line+'" target="_blank" rel="noopener">'+line+'</a></p>';
    } else {
      flushList();
      html += '<p>'+line+'</p>';
    }
  });
  flushList();
  document.getElementById('iiali-text').innerHTML = html || '<p>El Instituto Iberoamericano de Lenguas Indígenas (IIALI) coopera con Estados, pueblos indígenas e instituciones académicas para la preservación del plurilingüismo en Iberoamérica.</p>';
})();// IIALI

})();
