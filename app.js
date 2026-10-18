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
  'entre situacion critica y extinta':'Entre situación crítica y extinta / extinto',
  'extinto':'Extinto (silenciada)'
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
    map.fitBounds(b, { maxZoom: 9 });
    center = b.getCenter();
  } else { return; }
  var found = null;
  def.group.eachLayer(function(l){ if(l._atlasItem === item){ found = l; } });
  if(found){ found.openPopup(center); }
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
  items.slice().sort(function(a,b){ if(def.key === 'regiones'){ var ORD = ['amazonia','oriente boliviano','chaco','altiplano-valles']; var ia = ORD.indexOf(norm(a.name)), ib = ORD.indexOf(norm(b.name)); ia = ia < 0 ? 99 : ia; ib = ib < 0 ? 99 : ib; if(ia !== ib) return ia - ib; } return a.name.localeCompare(b.name); }).forEach(function(item){
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
      var g = norm(it.props['Grado de vitalidad'] || it.props['Grado de vitalidad de la lengua'] || '');
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
      '<div><h4>'+escapeHtml(label)+'</h4><p>'+desc+'</p></div>';
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
    return norm(item.props['Grado de vitalidad'] || item.props['Grado de vitalidad de la lengua'] || '');
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
    { num: nPeligroOMas+' de '+totalPueblos+' ('+pctPeligro+'%)', txt:'idiomas indígenas se encuentran entre los niveles "en peligro" y "extinto".' },
    { num: nCriticaOMas, txt:'idiomas están en situación crítica o ya silenciados/extintos.' }
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
    visor.classList.add('on');
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
