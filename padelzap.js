// ═══════════════════════════════════════════════════════════
//  PICALE - Conector PadelZap (Torneo Inaugural Somos Padel)
//  Jala partidos de las 9 categorias del torneo automaticamente.
//  Estructura real confirmada del API.
// ═══════════════════════════════════════════════════════════
window.PadelZap = (function(){
  // Usamos el PROXY de tu VPS para evitar CORS (tu web -> tu VPS -> PadelZap)
  var PROXY = 'https://api.picalereplay.com/api/v1/padelzap';
  var API = 'https://api.padelzap.com/api/v1/public';  // (referencia, ya no se usa directo)
  var TOURNAMENT = '98785af6-5ed7-4bfd-c912-08def727a813';

  // Las 9 categorias del torneo con su ID real.
  var CATEGORIAS = [
    { id: '3b9f7c31-ec39-4fa8-b2d2-08def727a820', nombre: '4ta Varonil' },
    { id: 'b1a7107b-22e0-4e8a-b2d6-08def727a820', nombre: '5ta Femenil' },
    { id: '9cfe9b43-f1b2-4a1b-b2d3-08def727a820', nombre: '5ta Varonil' },
    { id: '3766e423-1b74-49d7-b2d7-08def727a820', nombre: '6ta Femenil' },
    { id: '3fcc8f5f-c3ab-487c-b2d4-08def727a820', nombre: '6ta Varonil' },
    { id: '5fd4c59a-d502-49c6-b2d8-08def727a820', nombre: '7ma Femenil' },
    { id: 'acefe85f-6a57-4431-b2d5-08def727a820', nombre: '7ma Varonil' },
    { id: 'd57ee80a-f1ba-4737-b2d9-08def727a820', nombre: 'Mixto D (5ta-6ta)' },
    { id: 'c414d4a7-3bc3-4a04-b2da-08def727a820', nombre: 'Suma 5 Varonil' },
  ];
  // NOTA: el emparejamiento nombre<->id es tentativo salvo 5ta Femenil (confirmada).
  // Si algun nombre sale cambiado, se corrige aqui. El API tambien devuelve
  // category.nombre, asi que usamos ESE como fuente de verdad al vuelo.

  function urlView(catId, view){
    // apunta al proxy del VPS: /api/v1/padelzap/{catId}/{view}
    return PROXY + '/' + catId + '/' + view;
  }

  // Trae una vista (partidos, grupos, tabla-general, llaves) de una categoria
  function getVista(catId, view){
    return fetch(urlView(catId, view || 'partidos'), { headers:{'Accept':'application/json'} })
      .then(function(r){ return r.ok ? r.json() : null; })
      .catch(function(){ return null; });
  }

  // Normaliza un partido crudo del API a formato simple
  function normPartido(p, categoriaNombre){
    var sets = [];
    for (var i=1;i<=3;i++){
      var a=p['set'+i+'Pareja1'], b=p['set'+i+'Pareja2'];
      if ((a!==null && a!==undefined) || (b!==null && b!==undefined)) sets.push({a:a, b:b});
    }
    // numero de cancha (de "Cancha 3" saca 3; "Cancha 1 Estadio" saca 1)
    var nCancha = null;
    var mc = (p.cancha||'').match(/Cancha\s*(\d+)/i);
    if (mc) nCancha = parseInt(mc[1]);

    return {
      id: p.id,
      categoria: categoriaNombre || '',
      fase: p.tipo ? p.tipo.displayName : '',        // Grupo / 4tos / Semifinal / Final
      grupo: p.grupoNombre || '',
      cancha: p.cancha || '',                          // "Cancha 3"
      canchaNum: nCancha,                              // 3
      fecha: p.fecha,                                  // ISO
      parejaA: p.pareja1Nombre || 'Por definir',
      parejaB: p.pareja2Nombre || 'Por definir',
      marcador: p.marcadorResumen || '',
      sets: sets,
      estado: p.estadoPublicoTexto || '',             // "Por jugar", "Programado"...
      enVivo: !!p.esEnVivo,
      finalizado: !!p.esFinalizado,
      porJugar: !!p.esPorJugar,
      ganadorA: p.pareja1EsGanador,
      ganadorB: p.pareja2EsGanador,
    };
  }

  // Trae TODOS los partidos de TODAS las categorias, ya normalizados
  function getTodosLosPartidos(){
    var proms = CATEGORIAS.map(function(c){
      return getVista(c.id, 'partidos').then(function(res){
        if (!res || !res.success || !res.data) return [];
        var catNombre = (res.data.category && res.data.category.nombre) || c.nombre;
        var partidos = (res.data.partidos || []).map(function(p){
          return normPartido(p, catNombre);
        });
        return partidos;
      });
    });
    return Promise.all(proms).then(function(listas){
      // aplana todo en un solo array
      return [].concat.apply([], listas);
    });
  }

  // Filtra: partidos de una cancha fisica (por numero)
  function partidosDeCancha(todos, n){
    return todos.filter(function(p){ return p.canchaNum === n; });
  }

  // Filtra: el partido EN VIVO de una cancha (o el proximo por jugar)
  function partidoActualDeCancha(todos, n){
    var deCancha = partidosDeCancha(todos, n)
      .sort(function(a,b){ return new Date(a.fecha) - new Date(b.fecha); });
    var vivo = deCancha.find(function(p){ return p.enVivo; });
    if (vivo) return vivo;
    // si no hay en vivo, el proximo por jugar
    var ahora = Date.now();
    var prox = deCancha.find(function(p){ return p.porJugar && new Date(p.fecha).getTime() >= ahora - 3600000; });
    return prox || null;
  }

  // Proximos N partidos de todo el torneo (por hora, los que faltan)
  function proximos(todos, n){
    var ahora = Date.now();
    return todos
      .filter(function(p){ return p.parejaA!=='Por definir' && !p.finalizado; })
      .filter(function(p){ return new Date(p.fecha).getTime() >= ahora - 3600000; })
      .sort(function(a,b){ return new Date(a.fecha) - new Date(b.fecha); })
      .slice(0, n||10);
  }

  // Busca partidos de un jugador (por nombre parcial)
  function buscarJugador(todos, texto){
    var t = texto.toLowerCase();
    return todos.filter(function(p){
      return (p.parejaA + ' ' + p.parejaB).toLowerCase().indexOf(t) >= 0;
    }).sort(function(a,b){ return new Date(a.fecha) - new Date(b.fecha); });
  }

  // ── GRUPOS / TABLA (misma estructura) ──
  // Devuelve [{nombre:'A', parejas:[{nombre, corto, pos, clasifica, pj, pg, sg, sp, jg, jp}]}]
  function getGrupos(catId){
    return getVista(catId, 'grupos').then(function(res){
      if (!res || !res.success || !res.data) return null;
      var cat = (res.data.category && res.data.category.nombre) || '';
      var grupos = (res.data.grupos||[]).map(function(g){
        return {
          nombre: g.nombre,
          parejas: (g.parejas||[]).map(function(pj){
            return {
              nombre: pj.nombreCompleto,
              corto: pj.nombreCorto,
              pos: pj.posicionClasificacion,
              clasifica: !!pj.clasifica,
              pj: pj.partidosJugados, pg: pj.partidosGanados,
              sg: pj.setsGanados, sp: pj.setsPerdidos,
              jg: pj.juegosGanados, jp: pj.juegosPerdidos,
              difSets: (pj.setsGanados||0)-(pj.setsPerdidos||0),
              difJuegos: (pj.juegosGanados||0)-(pj.juegosPerdidos||0),
            };
          }).sort(function(a,b){ return (a.pos||99)-(b.pos||99); })
        };
      });
      return { categoria: cat, grupos: grupos };
    });
  }

  // ── LLAVES (brackets) ──
  // Devuelve rondas ordenadas: 4tos -> Semis -> Final
  function getLlaves(catId){
    return getVista(catId, 'llaves').then(function(res){
      if (!res || !res.success || !res.data) return null;
      var cat = (res.data.category && res.data.category.nombre) || '';
      // usar partidos (tienen tipo.orden: 3=4tos, 2=semis, 1=final)
      var partidos = (res.data.partidos||[]).map(function(p){
        return {
          fase: p.tipo ? p.tipo.displayName : '',
          orden: p.tipo ? p.tipo.orden : 99,
          numPartido: p.numPartido,
          cancha: p.cancha || '',
          fecha: p.fecha,
          parejaA: p.pareja1Nombre || p.pareja1Descripcion || 'Por definir',
          parejaB: p.pareja2Nombre || p.pareja2Descripcion || 'Por definir',
          marcador: p.marcadorResumen || '',
          ganadorA: p.pareja1EsGanador, ganadorB: p.pareja2EsGanador,
          estado: p.estadoPublicoTexto || '',
        };
      });
      // agrupar por fase, ordenadas 4tos->semis->final (orden desc)
      var fases = {};
      partidos.forEach(function(p){
        var k = p.fase || 'Otros';
        (fases[k] = fases[k] || []).push(p);
      });
      // ordenar las fases por orden (3=4tos primero)
      var fasesOrdenadas = Object.keys(fases).map(function(k){
        return { fase: k, orden: fases[k][0].orden, partidos: fases[k].sort(function(a,b){return a.numPartido-b.numPartido;}) };
      }).sort(function(a,b){ return b.orden - a.orden; });
      return { categoria: cat, fases: fasesOrdenadas };
    });
  }

  return {
    API: API, TOURNAMENT: TOURNAMENT, CATEGORIAS: CATEGORIAS,
    urlView: urlView, getVista: getVista,
    getTodosLosPartidos: getTodosLosPartidos,
    partidosDeCancha: partidosDeCancha,
    partidoActualDeCancha: partidoActualDeCancha,
    proximos: proximos,
    buscarJugador: buscarJugador,
    getGrupos: getGrupos,
    getLlaves: getLlaves,
  };
})();
