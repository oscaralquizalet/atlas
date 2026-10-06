(function(){
'use strict';

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
  { key:'Ubicación', label:'Ubicación', multiline:true },
  { key:'Familia Linguística', label:'Familia lingüística' },
  { key:'Familia linguística', label:'Familia lingüística' },
  { key:'Familia lingüística', label:'Familia lingüística' },
  { key:'Parcela', label:'Territorio / TCO' },
  { key:'Auto identificación', label:'Autoidentificación' },
  { key:'Número de hablantes', label:'Número de hablantes' },
  { key:'Grado de vitalidad', label:'Grado de vitalidad' },
  { key:'Grado de vitalidad de la lengua', label:'Grado de vitalidad' },
  { key:'Valoración', label:'Valoración' },
  { key:'Mayor información', label:null, link:true }
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
    layer.bindPopup(buildPopup(item.name, item.props));
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
    layer.bindPopup(buildPopup(item.name, item.props));
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
    var photoUrl = item.props && item.props.gx_media_links;
    var note = photoUrl
      ? '<img src="'+photoUrl+'" alt="Foto de '+escapeHtml(item.name)+'" style="width:100%;border-radius:3px;margin-top:2px;" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'block\';"><small style="display:none;color:#8a8474;">La foto no pudo cargarse (requiere conexión a internet).</small>'
      : '';
    marker.bindPopup(buildPopup(item.name, item.props, note), { maxWidth: 240 });
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
  items.slice().sort(function(a,b){ return a.name.localeCompare(b.name); }).forEach(function(item){
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
