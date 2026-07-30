// --- MAPA DE URLS Y LÓGICA DE ENLACES PARA LAS 54 PARASHOT (hatanakh.com) ---

/**
 * Genera el elemento HTML con el enlace web hacia hatanakh.com de forma robusta e insensible a variantes
 */
function obtenerEnlaceParasha(nombreParasha) {
    if (typeof nombreParasha !== 'string' || !nombreParasha.trim()) return '';

    const nombreLimpio = nombreParasha.trim();

    const formatParasha = (name) => {
        const key = name.trim();
        if (PARASHAT_URLS[key]) {
            const displayName = DISPLAY_NAMES[key] || key;
            return `<a href="${PARASHAT_URLS[key]}" target="_blank" rel="noopener noreferrer" class="parasha-link">${displayName} 🔗</a>`;
        }
        const foundKey = Object.keys(PARASHAT_URLS).find(k => k.toLowerCase() === key.toLowerCase());
        if (foundKey) {
            const displayName = DISPLAY_NAMES[foundKey] || foundKey;
            return `<a href="${PARASHAT_URLS[foundKey]}" target="_blank" rel="noopener noreferrer" class="parasha-link">${displayName} 🔗</a>`;
        }
        return key;
    };

    if (PARASHAT_URLS[nombreLimpio] || Object.keys(PARASHAT_URLS).some(k => k.toLowerCase() === nombreLimpio.toLowerCase())) {
        return formatParasha(nombreLimpio);
    }

    if (nombreLimpio.includes('-') || nombreLimpio.includes('—') || nombreLimpio.includes('/')) {
        const partes = nombreLimpio.split(/[-—/]/);
        const enlaces = partes.map(parte => formatParasha(parte.trim()));
        return enlaces.join(' - ');
    }

    return formatParasha(nombreLimpio);
}

// --- CONSTANTES Y ESTADO GLOBAL ---
const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
let currentViewDate = new Date();
let searchTimeout = null;
let selectedCalDateKey = null;

let startOnMonday = false;
let diasporaSetting = 'auto';

let userLocation = {
    name: 'Torremolinos',
    lat: 36.6204,
    lng: -4.4998,
    isGPS: false,
    tzid: 'Europe/Madrid'
};

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
    try {
        initLocation();
        loadTodayView();
        loadMonthCalendar();
        loadHolidays();
        fetchShabbatTabInfo();

        if (!localStorage.getItem('app_about_seen')) {
            showAboutModal();
        }
    } catch (e) {
        console.error("Error durante la inicialización de la PWA:", e);
    }
});

function switchTab(tabId) {
    if (!tabId) return;
    try {
        document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));

        const selectedTab = document.getElementById(tabId);
        if (selectedTab) selectedTab.classList.add('active');

        const activeBtn = Array.from(document.querySelectorAll('.nav-btn')).find(
            btn => {
                const attr = btn.getAttribute('onclick');
                return attr && attr.includes(tabId);
            }
        );
        if (activeBtn) activeBtn.classList.add('active');
    } catch (e) {
        console.error("Error al cambiar de pestaña:", e);
    }
}

function showAboutModal() {
    const overlay = document.getElementById('about-modal-overlay');
    if (overlay) overlay.style.display = 'flex';
}

function closeAboutModal() {
    const overlay = document.getElementById('about-modal-overlay');
    if (overlay) overlay.style.display = 'none';
    try {
        localStorage.setItem('app_about_seen', 'true');
    } catch (e) {
        console.warn("No se pudo guardar el estado del modal 'Acerca de':", e);
    }
}

// --- DETERMINACIÓN DE ISRAEL VS DIÁSPORA ---
function isIsraelLocation(lat, lng) {
    if (typeof lat !== 'number' || typeof lng !== 'number') return false;
    return (lat >= 29.4 && lat <= 33.4 && lng >= 34.2 && lng <= 35.9);
}

function getIsraelParam() {
    if (diasporaSetting === 'israel') return '&i=on';
    if (diasporaSetting === 'diaspora') return '&i=off';
    return isIsraelLocation(userLocation.lat, userLocation.lng) ? '&i=on' : '&i=off';
}

function changeDiasporaMode() {
    try {
        const sel = document.getElementById('diaspora-mode-select');
        if (sel) {
            diasporaSetting = sel.value;
            localStorage.setItem('app_diaspora_setting', diasporaSetting);
            updateLocationUI();
        }
    } catch (e) {
        console.error("Error al cambiar modo de Diáspora:", e);
    }
}

// --- AUXILIARES DE ZONA HORARIA LOCAL ---
function formatTimeLocal(dateObj) {
    if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) return '';
    const opts = { hour: '2-digit', minute: '2-digit', hour12: false };
    if (userLocation.tzid) opts.timeZone = userLocation.tzid;
    return dateObj.toLocaleTimeString('es-ES', opts);
}

function formatDateLocal(dateObj) {
    if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) return '';
    const opts = { day: 'numeric', month: 'numeric', year: 'numeric' };
    if (userLocation.tzid) opts.timeZone = userLocation.tzid;
    return dateObj.toLocaleDateString('es-ES', opts);
}

function getDayOfWeekLocal(dateObj) {
    if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) return 0;
    const opts = { weekday: 'long' };
    if (userLocation.tzid) opts.timeZone = userLocation.tzid;
    const str = dateObj.toLocaleDateString('es-ES', opts);
    const map = { 'domingo': 0, 'lunes': 1, 'martes': 2, 'miércoles': 3, 'jueves': 4, 'viernes': 5, 'sábado': 6 };
    return map[str.toLowerCase()] !== undefined ? map[str.toLowerCase()] : dateObj.getDay();
}

// --- AUXILIARES DE FECHAS HEBCAL ---
function parseHebcalDate(dateStr) {
    if (!dateStr) return new Date(NaN);
    if (dateStr.includes('T')) return new Date(dateStr);
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0); 
}

// --- GESTIÓN DE UBICACIÓN ---
function initLocation() {
    try {
        const savedLoc = localStorage.getItem('app_user_location');
        if (savedLoc) {
            const parsed = JSON.parse(savedLoc);
            if (parsed && typeof parsed === 'object') userLocation = parsed;
        }

        const savedDiaspora = localStorage.getItem('app_diaspora_setting');
        if (savedDiaspora) {
            diasporaSetting = savedDiaspora;
            const sel = document.getElementById('diaspora-mode-select');
            if (sel) sel.value = diasporaSetting;
        }
    } catch (e) {
        console.warn("Error leyendo almacenamiento local de ubicación:", e);
    }

    updateLocationUI();
}

async function updateLocationUI() {
    try {
        const displayText = userLocation.isGPS ? `${userLocation.name} (GPS)` : userLocation.name;

        const lblActive = document.getElementById('lbl-active-location');
        if (lblActive) lblActive.innerText = displayText;

        const btnLocationToday = document.getElementById('btn-today-location-tag');
        if (btnLocationToday) {
            btnLocationToday.innerText = `📍 ${displayText}`;
        }

        const btnHeaderLocation = document.getElementById('btn-header-location-tag');
        if (btnHeaderLocation) {
            btnHeaderLocation.innerText = `📍 ${displayText}`;
        }

        localStorage.setItem('app_user_location', JSON.stringify(userLocation));

        if (!userLocation.tzid) {
            await resolveTzid();
        }

        fetchTodayShabbatAndParasha();
        fetchUpcomingEvents();
        fetchShabbatTabInfo();
        loadMonthCalendar();
        loadHolidays();
    } catch (e) {
        console.error("Error al actualizar UI de ubicación:", e);
    }
}

async function resolveTzid() {
    try {
        const res = await fetch(`https://www.hebcal.com/shabbat?cfg=json&geo=pos&latitude=${userLocation.lat}&longitude=${userLocation.lng}&M=on`);
        const data = await res.json();
        if (data && data.location && data.location.tzid) {
            userLocation.tzid = data.location.tzid;
        }
    } catch (e) {
        console.warn("No se pudo resolver tzid antes de renderizar:", e);
    }
}

function setLocationFromGPS() {
    if (!navigator.geolocation) {
        alert("La geolocalización no está soportada por su dispositivo/navegador.");
        return;
    }

    const lbl = document.getElementById('lbl-active-location');
    if (lbl) lbl.innerText = "Obteniendo datos GPS...";

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            try {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                let cityName = "Ubicación detectada";

                try {
                    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
                    const data = await res.json();
                    if (data && data.address) {
                        cityName = data.address.city || data.address.town || data.address.village || "Ubicación GPS";
                    }
                } catch (e) {
                    console.warn("Fallo al obtener nombre de ciudad vía Nominatim:", e);
                }

                userLocation = {
                    name: cityName,
                    lat: lat,
                    lng: lng,
                    isGPS: true,
                    tzid: null
                };
                updateLocationUI();
            } catch (err) {
                console.error("Error procesando posición GPS:", err);
                updateLocationUI();
            }
        },
        (error) => {
            alert("No se pudo obtener la ubicación mediante GPS. Puedes buscar tu ciudad manualmente más abajo.");
            updateLocationUI();
        }
    );
}

function searchCityDebounce() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(searchCity, 400);
}

async function searchCity() {
    const inputElem = document.getElementById('city-search');
    const resultsContainer = document.getElementById('city-results-list');
    if (!inputElem || !resultsContainer) return;

    const query = inputElem.value.trim();
    if (query.length < 3) {
        resultsContainer.innerHTML = '';
        return;
    }

    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`);
        const data = await res.json();

        resultsContainer.innerHTML = '';
        if (Array.isArray(data)) {
            data.forEach(item => {
                if (!item || !item.display_name) return;
                const div = document.createElement('div');
                div.className = 'dropdown-item';
                div.innerText = item.display_name;
                div.onclick = () => {
                    const cityName = item.display_name.split(',')[0];
                    userLocation = {
                        name: cityName,
                        lat: parseFloat(item.lat),
                        lng: parseFloat(item.lon),
                        isGPS: false,
                        tzid: null
                    };
                    resultsContainer.innerHTML = '';
                    inputElem.value = '';
                    updateLocationUI();
                };
                resultsContainer.appendChild(div);
            });
        }
    } catch(e) {
        console.error("Error buscando ciudad:", e);
    }
}

// --- TRADUCTOR Y LIMPIADOR FONÉTICO INTEGRAL ---
function traducirTexto(text) {
    if (typeof text !== 'string' || !text) return '';
    let t = text;
    
    t = t.replace(/\(CH[’\'"]{1,2}M\)/gi, '(Jol HaMoed)');
    t = t.replace(/(\d+)(?:st|nd|rd|th)\s+day\s+of\s+the\s+Omer/gi, 'Omer día $1');
    t = t.replace(/day\s+of\s+the\s+Omer/gi, 'Día del Omer');
    t = t.replace(/Janucá:\s*8th Day/gi, 'Janucá: 8º día');
    t = t.replace(/8th Day/gi, '8º día');
    t = t.replace(/\bcandles\b/gi, 'velas');
    t = t.replace(/\bcandle\b/gi, 'vela');

    t = t.replace(/Shabbat/gi, 'Shabat');
    t = t.replace(/Parashát/gi, 'Parashat');
    t = t.replace(/Fast begins/gi, 'Inicio del ayuno');
    t = t.replace(/Fast ends/gi, 'Fin del ayuno');
    t = t.replace(/Candle lighting/gi, 'Encendido de velas');
    t = t.replace(/Vela lighting/gi, 'Encendido de velas');
    t = t.replace(/Havdalah/gi, 'Havdalá');
    
    t = t.replace(/Rosh Chodesh/gi, 'Rosh Jódesh');
    t = t.replace(/\bChodesh\b/gi, 'Jódesh'); // Cobertura genérica cuando "Chodesh" va sin "Rosh" delante

    t = t.replace(/Finish eating chametz/gi, 'Hora límite para comer jametz');

    t = t.replace(/Shabat Mevarchim Chodesh/gi, 'Shabat Mevarjim');
    t = t.replace(/Shabat Mevorchim Chodesh/gi, 'Shabat Mevarjim');
    t = t.replace(/Shabat Mevarchim/gi, 'Shabat Mevarjim');
    t = t.replace(/Shabat Mevorchim/gi, 'Shabat Mevarjim');

    t = t.replace(/Erev Rosh Hashana/gi, 'Víspera de Rosh Hashaná');
    t = t.replace(/Erev Yom Kippur/gi, 'Víspera de Yom Kipur');
    t = t.replace(/Erev Sukkot/gi, 'Víspera de Sucot');
    t = t.replace(/Erev Pesah/gi, 'Víspera de Pésaj');
    t = t.replace(/Erev Shavuot/gi, 'Víspera de Shavuot');
    t = t.replace(/Erev Simchat Torah/gi, 'Víspera de Simjat Torá');

    t = t.replace(/Cheshvan/gi, 'Jeshván');
    t = t.replace(/Chanukah/gi, 'Janucá');
    t = t.replace(/Tu BiShvat/gi, 'Tu BiShevat');
    t = t.replace(/Tish'a B'Av/gi, 'Tishá BeAv');
    t = t.replace(/Tzom Tammuz/gi, 'Ayuno de Tamuz');
    t = t.replace(/Shavuot/gi, 'Shavuot');
    t = t.replace(/Rosh Hashana/gi, 'Rosh Hashaná');
    t = t.replace(/Yom Kippur/gi, 'Yom Kipur');
    t = t.replace(/Sukkot/gi, 'Sucot');

    t = t.replace(/Erev /gi, 'Víspera de ');

    const parashotMap = {
        "Bereshit": "Bereshit", "Noach": "Nóaj", "Lech-Lecha": "Lej Lejá",
        "Vayera": "Vayerá", "Chayei Sara": "Jayé Sará", "Toldot": "Toledot",
        "Vayetzei": "Vayetzé", "Vayishlach": "Vayishlaj", "Vayeshev": "Vayéshev",
        "Miketz": "Miketz", "Vayigash": "Vayigash", "Vayechi": "Vayejí",
        "Shemot": "Shemot", "Vaera": "Vaerá", "Bo": "Bo",
        "Beshalach": "Beshalaj", "Yitro": "Yitró", "Mishpatim": "Mishpatim",
        "Terumah": "Terumá", "Tetzaveh": "Tetzavé", "Ki Tisa": "Ki Tisá",
        "Vayakhel": "Vayakhel", "Pekudei": "Pekudei", "Vayikra": "Vayikrá",
        "Tzav": "Tzav", "Shmini": "Sheminí", "Tazria": "Tazría",
        "Metzora": "Metzorá", "Achrei Mot": "Ajarei Mot", "Kedoshim": "Kedoshim",
        "Emor": "Emor", "Behar": "Behar", "Bechukotai": "Bejukotai",
        "Bamidbar": "Bamidbar", "Nasso": "Nasó", 
        "Beha'alotcha": "Beha'alotjá", "Beha’alotcha": "Beha'alotjá", "Beha'alotja": "Beha'alotjá", "Beha’alotja": "Beha'alotjá",
        "Sh'lach": "Shlaj", "Sh’lach": "Shlaj", "Sh'laj": "Shlaj", "Sh’laj": "Shlaj", "Shlaj": "Shlaj",
        "Korach": "Kóraj", "Chukat": "Jukat",
        "Balak": "Balak", "Pinchas": "Pinjas", "Matot": "Matot",
        "Masei": "Masei", "Devarim": "Devarim", "Va'etchanan": "Vaetjanán", "Vaetjanan": "Vaetjanán",
        "Eikev": "Ekev", 
        "Re'eh": "Re'éh", "Re’eh": "Re'éh", 
        "Shoftim": "Shoftim",
        "Ki Teitzei": "Ki Tetzé", "Ki Tavo": "Ki Tavó", "Nitzavim": "Nitzavim",
        "Vayeilech": "Vayélej", 
        "Ha'Azinu": "Ha'azinu", "Ha’Azinu": "Ha'azinu", "Ha'azinu": "Ha'azinu", "Ha’azinu": "Ha'azinu",
        "V'Zot HaBerachah": "Vezot Haberajá"
    };

    for (const [heb, app] of Object.entries(parashotMap)) {
        const regex = new RegExp(`(?<=^|\\s|-)${heb.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|\\s|-)`, 'gi');
        t = t.replace(regex, app);
    }

    // Traducir nombres de meses hebreos dentro de títulos de eventos (Rosh Jódesh, Mevarjim, etc.)
    const mesesOrdenados = Object.entries(MESES_HEBREOS_ES).sort((a, b) => b[0].length - a[0].length);
    mesesOrdenados.forEach(([heb, es]) => {
        const escapado = heb.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regexMes = new RegExp(`\\b${escapado}\\b`, 'g');
        t = t.replace(regexMes, es);
    });

    t = t.replace(/Ch/g, 'J');
    t = t.replace(/ch/g, 'j');

    t = t.replace(/:\s*\d{1,2}:\d{2}\s*(am|pm)?/gi, '');
    
    return t.trim();
}

function traducirNombreMesHebreo(m) {
    if (!m) return '';
    return MESES_HEBREOS_ES[m] || m;
}

// --- VISTA HOY ---
async function loadTodayView() {
    const now = new Date();
    const dayOfWeek = getDayOfWeekLocal(now);
    const dayName = DIAS_SEMANA[dayOfWeek];
    
    const optsDate = { day: 'numeric', month: 'long', year: 'numeric' };
    if (userLocation.tzid) optsDate.timeZone = userLocation.tzid;
    const dateFormatted = now.toLocaleDateString('es-ES', optsDate);

    const elemGreg = document.getElementById('today-gregorian');
    const elemHeaderGreg = document.getElementById('header-gregorian-date');
    const elemHeb = document.getElementById('today-hebrew');
    const elemHeaderHeb = document.getElementById('header-hebrew-date');

    const gregFormattedText = `${dayName}, ${dateFormatted}`;
    if (elemGreg) elemGreg.innerText = gregFormattedText;
    if (elemHeaderGreg) elemHeaderGreg.innerText = gregFormattedText;

    try {
        const res = await fetch(`https://www.hebcal.com/converter?cfg=json&gy=${now.getFullYear()}&gm=${now.getMonth()+1}&gd=${now.getDate()}&g2h=1`);
        const data = await res.json();
        
        if (data && data.hm) {
            const mesHebreoEs = traducirNombreMesHebreo(data.hm);
            const strFechaHebrea = `${data.hd} de ${mesHebreoEs} de ${data.hy}`;
            if (elemHeb) elemHeb.innerText = strFechaHebrea;
            if (elemHeaderHeb) elemHeaderHeb.innerText = strFechaHebrea;
        } else {
            throw new Error("Respuesta inválida del convertidor");
        }
    } catch(e) {
        console.error("Error obteniendo fecha hebrea de hoy:", e);
        if (elemHeb) elemHeb.innerText = "Error al cargar fecha hebrea.";
    }

    fetchTodayShabbatAndParasha();
    fetchUpcomingEvents();
}

async function fetchTodayShabbatAndParasha() {
    const cardShabbat = document.getElementById('card-shabbat-today');
    const cardParasha = document.getElementById('card-parasha-today');
    const shabbatInfoElem = document.getElementById('shabbat-today-info');
    const parashaInfoElem = document.getElementById('parasha-today-info');

    try {
        const now = new Date();
        const dayOfWeek = getDayOfWeekLocal(now);
        const iParam = getIsraelParam();

        if (dayOfWeek !== 5 && dayOfWeek !== 6) {
            if (cardShabbat) cardShabbat.style.display = 'none';
            if (cardParasha) cardParasha.style.display = 'none';
            return;
        }

        const res = await fetch(`https://www.hebcal.com/shabbat?cfg=json&geo=pos&latitude=${userLocation.lat}&longitude=${userLocation.lng}&M=on${iParam}`);
        const data = await res.json();

        if (data && data.location && data.location.tzid) {
            userLocation.tzid = data.location.tzid;
        }

        const items = (data && Array.isArray(data.items)) ? data.items : [];
        let candles = items.find(i => i && i.category === 'candles');
        let havdalah = items.find(i => i && i.category === 'havdalah');
        let parasha = items.find(i => i && i.category === 'parashat');

        if (havdalah && havdalah.date) {
            const hDate = parseHebcalDate(havdalah.date);
            if (!isNaN(hDate.getTime()) && now.getTime() > hDate.getTime()) {
                if (cardShabbat) cardShabbat.style.display = 'none';
                if (cardParasha) cardParasha.style.display = 'none';
                return;
            }
        }

        if (cardShabbat) cardShabbat.style.display = 'block';
        if (cardParasha) cardParasha.style.display = 'block';

        let shabbatHtml = '';
        if (candles && candles.date) {
            let cDate = parseHebcalDate(candles.date);
            if (!isNaN(cDate.getTime())) {
                shabbatHtml += `🕯️ Encendido de velas (viernes): <strong>${formatTimeLocal(cDate)}</strong><br>`;
            }
        }
        if (havdalah && havdalah.date) {
            let hDate = parseHebcalDate(havdalah.date);
            if (!isNaN(hDate.getTime())) {
                shabbatHtml += `🍷 Havdalá: <strong>${formatTimeLocal(hDate)}</strong>`;
            }
        }
        if (shabbatInfoElem) {
            shabbatInfoElem.innerHTML = shabbatHtml || 'No hay datos de Shabat para esta semana.';
        }

        if (parashaInfoElem) {
            if (parasha && parasha.title) {
                let nombreLimpio = traducirTexto(parasha.title).replace(/^Parashat\s+/i, '');
                parashaInfoElem.innerHTML = `<strong>Parashat ${obtenerEnlaceParasha(nombreLimpio)}</strong>`;
            } else {
                parashaInfoElem.innerHTML = '<strong>Lectura especial</strong>';
            }
        }
    } catch(e) {
        console.error("Error al cargar Shabat/Parashá de hoy:", e);
        if (cardShabbat) cardShabbat.style.display = 'none';
        if (cardParasha) cardParasha.style.display = 'none';
    }
}

async function fetchUpcomingEvents() {
    const listContainer = document.getElementById('upcoming-events-list');
    if (!listContainer) return;

    const now = new Date();
    const dayOfWeek = getDayOfWeekLocal(now);

    let daysToTarget = (7 - dayOfWeek) % 7;
    if (daysToTarget === 0) daysToTarget = 7; 
    if (dayOfWeek === 5 || dayOfWeek === 6) daysToTarget += 7;

    const targetDate = new Date(now);
    targetDate.setDate(now.getDate() + daysToTarget);
    targetDate.setHours(23, 59, 59, 999);

    try {
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        const iParam = getIsraelParam();

        let url = `https://www.hebcal.com/hebcal?v=1&cfg=json&maj=on&min=on&mod=on&mf=on&ss=on&s=on&c=on&m=on&nx=on&mvch=on&o=on&geo=pos&latitude=${userLocation.lat}&longitude=${userLocation.lng}&year=${year}&month=${month}${iParam}`;
        let res = await fetch(url);
        let data = await res.json();

        if (data && data.location && data.location.tzid) {
            userLocation.tzid = data.location.tzid;
        }

        let itemsList = (data && Array.isArray(data.items)) ? data.items : [];

        if (now.getDate() > 20) {
            const nextMonthDate = new Date(year, month, 1);
            const nextUrl = `https://www.hebcal.com/hebcal?v=1&cfg=json&maj=on&min=on&mod=on&mf=on&ss=on&s=on&c=on&m=on&nx=on&mvch=on&o=on&geo=pos&latitude=${userLocation.lat}&longitude=${userLocation.lng}&year=${nextMonthDate.getFullYear()}&month=${nextMonthDate.getMonth() + 1}${iParam}`;
            try {
                const resNext = await fetch(nextUrl);
                const dataNext = await resNext.json();
                if (dataNext && Array.isArray(dataNext.items)) {
                    itemsList = itemsList.concat(dataNext.items);
                }
            } catch(e) {
                console.warn("Fallo al obtener eventos del mes subsecuente:", e);
            }
        }

        const inRangeItems = itemsList.filter(item => {
            if (!item || !item.date) return false;
            const evDate = parseHebcalDate(item.date);
            return !isNaN(evDate.getTime()) && evDate >= now && evDate <= targetDate;
        });

        const shabbatItems = [];
        const otherEvents = [];

        inRangeItems.forEach(item => {
            if (!item || !item.date) return;
            const dObj = parseHebcalDate(item.date);
            const isSaturday = getDayOfWeekLocal(dObj) === 6;

            const isShabbatComponent = item.category === 'candles' || 
                                       item.category === 'havdalah' || 
                                       item.category === 'parashat' || 
                                       (item.title && item.title.startsWith('Parashat')) ||
                                       (item.category === 'roshchodesh' && isSaturday) || 
                                       item.category === 'mevarchim' || item.category === 'mevorchim';

            if (isShabbatComponent) {
                shabbatItems.push(item);
            } else {
                otherEvents.push(item);
            }
        });

        const shabbatGroups = {};

        shabbatItems.forEach(item => {
            const d = parseHebcalDate(item.date);
            if (isNaN(d.getTime())) return;

            const dDayOfWeek = getDayOfWeekLocal(d);
            const sabadoObj = new Date(d);
            
            if (dDayOfWeek === 5) sabadoObj.setDate(d.getDate() + 1);

            const key = `${sabadoObj.getFullYear()}-${String(sabadoObj.getMonth()+1).padStart(2,'0')}-${String(sabadoObj.getDate()).padStart(2,'0')}`;

            if (!shabbatGroups[key]) {
                shabbatGroups[key] = {
                    sabadoDate: sabadoObj,
                    candles: null,
                    havdalah: null,
                    parashat: null,
                    roshChodesh: null,
                    mevarchim: null
                };
            }

            if (item.category === 'candles') shabbatGroups[key].candles = item;
            if (item.category === 'havdalah') shabbatGroups[key].havdalah = item;
            if (item.category === 'parashat' || (item.title && item.title.startsWith('Parashat'))) {
                shabbatGroups[key].parashat = item;
            }
            if (item.category === 'roshchodesh') {
                shabbatGroups[key].roshChodesh = item;
            }
            if (item.category === 'mevarchim' || item.category === 'mevorchim') {
                shabbatGroups[key].mevarchim = item;
            }
        });

        let unifiedList = [];

        Object.keys(shabbatGroups).forEach(key => {
            const group = shabbatGroups[key];
            let lineasShabat = [];
            let sortTimestamp = group.sabadoDate.getTime();

            if (group.candles && group.candles.date) {
                const dViernes = parseHebcalDate(group.candles.date);
                if (!isNaN(dViernes.getTime())) {
                    sortTimestamp = dViernes.getTime();
                    
                    const isTodayFriday = (dayOfWeek === 5 && dViernes.getDate() === now.getDate());
                    if (!isTodayFriday) {
                        const horaVelas = formatTimeLocal(dViernes);
                        const fechaVelas = formatDateLocal(dViernes);
                        lineasShabat.push(`Viernes ${fechaVelas}, encendido de velas a las ${horaVelas}`);
                    }
                }
            }

            let sabadoParts = [];
            const dSab = group.sabadoDate;
            const fechaSab = formatDateLocal(dSab);
            const isTodaySaturday = (dayOfWeek === 6 && dSab.getDate() === now.getDate());

            if (!isTodaySaturday) {
                if (group.roshChodesh && group.roshChodesh.title) {
                    sabadoParts.push(traducirTexto(group.roshChodesh.title));
                }

                if (group.parashat && group.parashat.title) {
                    let nombreParasha = traducirTexto(group.parashat.title).replace(/^Parashat\s+/i, '');
                    sabadoParts.push(`Parashat ${obtenerEnlaceParasha(nombreParasha)}`);
                } else if (!group.roshChodesh) {
                    sabadoParts.push(`Lectura especial`);
                }

                if (group.mevarchim && group.mevarchim.title) {
                    sabadoParts.push(traducirTexto(group.mevarchim.title)); 
                }

                if (group.havdalah && group.havdalah.date) {
                    const dHav = parseHebcalDate(group.havdalah.date);
                    if (!isNaN(dHav.getTime())) {
                        const horaHav = formatTimeLocal(dHav);
                        sabadoParts.push(`Havdalá a las ${horaHav}`);
                    }
                }

                if (sabadoParts.length > 0) {
                    lineasShabat.push(`Sábado ${fechaSab}, ${sabadoParts.join(' y ')}`);
                }
            }

            if (lineasShabat.length > 0) {
                unifiedList.push({
                    timestamp: sortTimestamp,
                    html: `
                        <div class="holiday-item">
                            <div class="holiday-title">🕯️ <strong>Próximo Shabat:</strong></div>
                            <div class="holiday-date" style="margin-top: 4px; line-height: 1.4;">
                                ${lineasShabat.join('<br>')}
                            </div>
                        </div>
                    `
                });
            }
        });

        otherEvents.forEach(ev => {
            if (!ev || !ev.date) return;
            const dObj = parseHebcalDate(ev.date);
            if (isNaN(dObj.getTime())) return;

            const evDayOfWeek = getDayOfWeekLocal(dObj);
            const dayName = DIAS_SEMANA[evDayOfWeek];
            const dateStr = formatDateLocal(dObj);
            const timeStr = (ev.date.includes('T') && !ev.date.includes('T00:00:00')) ? ` • ⏰ ${formatTimeLocal(dObj)}` : '';
            
            unifiedList.push({
                timestamp: dObj.getTime(),
                html: `
                    <div class="holiday-item">
                        <div class="holiday-title">${traducirTexto(ev.title)}</div>
                        <div class="holiday-date">📅 ${dayName}, ${dateStr}${timeStr}</div>
                    </div>
                `
            });
        });

        unifiedList.sort((a, b) => a.timestamp - b.timestamp);

        if (unifiedList.length === 0) {
            listContainer.innerText = "No hay eventos registrados para el periodo.";
            return;
        }

        listContainer.innerHTML = unifiedList.map(item => item.html).join('');
    } catch (e) {
        console.error("Error procesando próximos eventos:", e);
        listContainer.innerText = "Error al cargar próximos eventos.";
    }
}

// --- CONVERSIÓN ---

async function fetchEventsCompactForDate(y, m, d) {
    try {
        const iParam = getIsraelParam();
        const res = await fetch(`https://www.hebcal.com/hebcal?v=1&cfg=json&maj=on&min=on&mod=on&mf=on&ss=on&s=on&c=on&m=on&nx=on&mvch=on&o=on&geo=pos&latitude=${userLocation.lat}&longitude=${userLocation.lng}&year=${y}&month=${m}${iParam}`);
        const data = await res.json();

        if (!data || !Array.isArray(data.items)) return '';

        const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dayEvents = data.items.filter(item => item && item.date && item.date.startsWith(dateStr));

        let hasParashat = false;
        let lineas = [];

        dayEvents.forEach(ev => {
            let dObj = parseHebcalDate(ev.date);
            let hasTime = ev.date.includes('T') && !ev.date.includes('T00:00:00') && !ev.date.includes('T02:00:00');
            let timeStr = hasTime ? ` (${formatTimeLocal(dObj)})` : '';
            
            let textoEv = traducirTexto(ev.title);
            if (ev.category === 'parashat' || textoEv.startsWith('Parashat')) {
                let nombreLimpio = textoEv.replace(/^Parashat\s+/i, '');
                textoEv = `Parashat ${obtenerEnlaceParasha(nombreLimpio)}`;
                hasParashat = true;
            }

            lineas.push(`• ${textoEv}${timeStr}`);
        });

        const dateObj = new Date(y, m - 1, d);
        const isSaturday = getDayOfWeekLocal(dateObj) === 6;

        if (isSaturday && !hasParashat) {
            lineas.unshift(`• Lectura especial`);
        }

        if (lineas.length === 0) {
            return '<div style="margin-top: 8px; font-size: 0.85rem; color: #64748b;"><em>Sin eventos destacados</em></div>';
        }

        return `
            <div style="margin-top: 10px; padding-top: 8px; border-top: 1px dashed #bae6fd; font-size: 0.85rem; color: #1e293b; line-height: 1.4;">
                <strong>Eventos del día:</strong><br>
                ${lineas.join('<br>')}
            </div>
        `;
    } catch (e) {
        console.error("Error obteniendo eventos para conversión:", e);
        return '<div style="margin-top: 8px; font-size: 0.85rem; color: #ef4444;">Error al cargar eventos.</div>';
    }
}

async function convertGregorianToHebrew() {
    const valElem = document.getElementById('greg-date');
    const afterSunsetElem = document.getElementById('convert-after-sunset');
    const resBox = document.getElementById('res-greg-to-heb');

    if (!valElem || !resBox) return;

    const val = valElem.value;
    const afterSunset = afterSunsetElem ? afterSunsetElem.checked : false;

    if (!val) {
        alert("Seleccione una fecha gregoriana.");
        return;
    }

    let [y, m, d] = val.split('-').map(Number);
    if (!y || !m || !d) {
        alert("Fecha no válida.");
        return;
    }

    const sunsetParam = afterSunset ? '&gs=on' : '';

    try {
        const res = await fetch(`https://www.hebcal.com/converter?cfg=json&gy=${y}&gm=${m}&gd=${d}&g2h=1${sunsetParam}`);
        const data = await res.json();

        if (data && data.hm) {
            const gregDateObj = new Date(y, m - 1, d);
            const dayOfWeek = getDayOfWeekLocal(gregDateObj);
            const dayName = DIAS_SEMANA[dayOfWeek] || '';
            const monthName = gregDateObj.toLocaleDateString('es-ES', { month: 'long' });
            
            const mesHeb = traducirNombreMesHebreo(data.hm);
            const eventosHtml = await fetchEventsCompactForDate(y, m, d);

            const txtSunset = afterSunset ? ' (tras la puesta de sol)' : '';

            resBox.style.display = 'block';
            resBox.innerHTML = `
                <strong>Fecha gregoriana:</strong><br>
                📅 ${dayName} ${d} de ${monthName} de ${y}${txtSunset}<br><br>
                <strong>Fecha Hebrea:</strong><br>
                ✡️ ${data.hd} de ${mesHeb} de ${data.hy}
                ${eventosHtml}
            `;
        } else {
            throw new Error("Datos devueltos erróneos");
        }
    } catch(e) {
        console.error("Error en la conversión Gregoriano->Hebreo:", e);
        alert("Error en la conversión.");
    }
}

async function convertHebrewToGregorian() {
    const dayElem = document.getElementById('heb-day');
    const monthElem = document.getElementById('heb-month');
    const yearElem = document.getElementById('heb-year');
    const resBox = document.getElementById('res-heb-to-greg');

    if (!dayElem || !monthElem || !yearElem || !resBox) return;

    const day = dayElem.value;
    const month = monthElem.value;
    const year = yearElem.value;

    try {
        const res = await fetch(`https://www.hebcal.com/converter?cfg=json&hy=${year}&hm=${month}&hd=${day}&h2g=1`);
        const data = await res.json();

        if (data && data.gy && data.gm && data.gd) {
            let gregDate = new Date(data.gy, data.gm - 1, data.gd);
            const dayOfWeek = getDayOfWeekLocal(gregDate);
            const dateStr = formatDateLocal(gregDate);
            const eventosHtml = await fetchEventsCompactForDate(data.gy, data.gm, data.gd);
            const mesHebEs = traducirNombreMesHebreo(month);

            resBox.style.display = 'block';
            resBox.innerHTML = `
                <strong>Fecha hebrea:</strong><br>
                ✡️ ${day} de ${mesHebEs} de ${year}<br><br>
                <strong>Fecha gregoriana:</strong><br>
                📅 ${DIAS_SEMANA[dayOfWeek]}, ${dateStr}
                ${eventosHtml}
            `;
        } else {
            throw new Error("Respuesta de API inconsistente");
        }
    } catch(e) {
        console.error("Error en la conversión Hebreo->Gregoriano:", e);
        alert("Error en la conversión.");
    }
}

// --- FESTIVOS ---
async function loadHolidays() {
    const yearElem = document.getElementById('holidays-year');
    const container = document.getElementById('holidays-list');
    if (!container || !yearElem) return;

    const year = yearElem.value;

    try {
        const iParam = getIsraelParam();
        const res = await fetch(`https://www.hebcal.com/hebcal?v=1&cfg=json&maj=on&min=on&nx=on&mvch=on&o=on&year=${year}&yt=H${iParam}`);
        const data = await res.json();

        let html = '';
        const items = (data && Array.isArray(data.items)) ? data.items : [];

        items.forEach(ev => {
            if (!ev || !ev.date) return;
            if (ev.category === 'omer' || (ev.title && ev.title.toLowerCase().includes('omer'))) {
                const omNum = ev.om || (ev.title && (ev.title.match(/\d+/) || [])[0]);
                if (Number(omNum) !== 1 && Number(omNum) !== 49) {
                    return;
                }
            }
            const d = parseHebcalDate(ev.date);
            if (isNaN(d.getTime())) return;

            const dayOfWeek = getDayOfWeekLocal(d);
            const dateStr = formatDateLocal(d);
            html += `
                <div class="holiday-item">
                    <div class="holiday-title">${traducirTexto(ev.title)}</div>
                    <div class="holiday-date">📅 ${DIAS_SEMANA[dayOfWeek]}, ${dateStr}</div>
                </div>
            `;
        });
        container.innerHTML = html || 'No hay eventos disponibles.';
    } catch(e) {
        console.error("Error cargando festivos:", e);
        container.innerText = "Error al cargar los festivos.";
    }
}

// --- SHABAT TAB ---
async function fetchShabbatTabInfo() {
    const container = document.getElementById('shabbat-details-list');
    if (!container) return;

    try {
        const now = new Date();
        const iParam = getIsraelParam();

        const res = await fetch(`https://www.hebcal.com/shabbat?cfg=json&geo=pos&latitude=${userLocation.lat}&longitude=${userLocation.lng}&M=on${iParam}`);
        const data = await res.json();

        if (data && data.location && data.location.tzid) {
            userLocation.tzid = data.location.tzid;
        }

        let items = (data && Array.isArray(data.items)) ? data.items : [];

        items = items.filter(item => {
            if (!item) return false;
            return item.category === 'candles' || 
                   item.category === 'havdalah' || 
                   item.category === 'parashat' || 
                   (item.category === 'mevorchim' || item.category === 'mevarchim') ||
                   (item.title && (item.title.startsWith('Shabbat') || item.title.startsWith('Parashat')));
        });

        let html = `<strong>Ubicación:</strong> ${userLocation.name}<br><br>`;

        let groups = {};
        items.forEach(item => {
            if (!item.date) return;
            let d = parseHebcalDate(item.date);
            if (isNaN(d.getTime())) return;

            let itemDayOfWeek = getDayOfWeekLocal(d);
            let sabadoObj = new Date(d);
            
            // Forzar lógicamente que todo evento caiga bajo el Sábado de esa semana
            if (itemDayOfWeek !== 6) {
                let daysToSaturday = (6 - itemDayOfWeek + 7) % 7;
                sabadoObj.setDate(d.getDate() + daysToSaturday);
            }

            let key = `${sabadoObj.getFullYear()}-${String(sabadoObj.getMonth()+1).padStart(2,'0')}-${String(sabadoObj.getDate()).padStart(2,'0')}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(item);
        });

        let sortedKeys = Object.keys(groups).sort();
        let validKeys = [];

        for (let key of sortedKeys) {
            let parts = key.split('-').map(Number);
            let gDate = new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999);
            if (gDate.getTime() < now.getTime()) continue; 

            let currentGroup = groups[key];
            let havdalahItem = currentGroup.find(i => i.category === 'havdalah');
            let isPast = false;
            
            if (havdalahItem && havdalahItem.date) {
                let hDate = parseHebcalDate(havdalahItem.date);
                if (!isNaN(hDate.getTime()) && now.getTime() > hDate.getTime()) {
                    isPast = true;
                }
            }
            if (!isPast) {
                validKeys.push(key);
            }
        }

        if (validKeys.length > 0) {
            html += renderShabbatBlock('Horario de este Shabat', groups[validKeys[0]]);
        }
        if (validKeys.length > 1) {
            html += `<hr style="border:0; border-top: 1px dashed #cbd5e1; margin: 15px 0;">`;
            html += renderShabbatBlock('Horario del próximo Shabat', groups[validKeys[1]]);
        }

        if (validKeys.length === 0) {
            html += `<div style="color: #64748b;">No hay próximos eventos de Shabat disponibles en este periodo.</div>`;
        }

        container.innerHTML = html;
    } catch(e) {
        console.error("Error al cargar detalles de la pestaña Shabat:", e);
        container.innerHTML = `<div style="color: #ef4444;">Error al cargar los detalles de Shabat.</div>`;
    }
}

function renderShabbatBlock(title, itemList) {
    if (!Array.isArray(itemList)) return '';
    let blockHtml = `<h4 style="margin: 8px 0 12px 0; color: #2b579a;">${title}</h4>`;
    
    let dateMap = {};
    itemList.forEach(item => {
        if (!item || !item.date) return;
        let d = parseHebcalDate(item.date);
        if (isNaN(d.getTime())) return;

        let dateKey = formatDateLocal(d);
        if (!dateMap[dateKey]) dateMap[dateKey] = [];
        dateMap[dateKey].push(item);
    });

    Object.keys(dateMap).forEach(dateKey => {
        let evList = dateMap[dateKey];
        if (evList.length === 0) return;

        let firstD = parseHebcalDate(evList[0].date);
        let dayOfWeek = getDayOfWeekLocal(firstD);
        let dayName = DIAS_SEMANA[dayOfWeek];

        let lineas = [];
        let hasParashat = false;

        evList.forEach(ev => {
            let dObj = parseHebcalDate(ev.date);
            let hasTime = ev.date.includes('T') && !ev.date.includes('T00:00:00') && !ev.date.includes('T02:00:00');
            let timeStr = hasTime ? ` • ⏰ ${formatTimeLocal(dObj)}` : '';
            
            let textoEv = traducirTexto(ev.title);
            if (ev.category === 'parashat' || textoEv.startsWith('Parashat')) {
                let nombreLimpio = textoEv.replace(/^Parashat\s+/i, '');
                textoEv = `Parashat ${obtenerEnlaceParasha(nombreLimpio)}`;
                hasParashat = true;
            }

            lineas.push(`<strong>${textoEv}</strong>${timeStr}`);
        });

        if (dayOfWeek === 6 && !hasParashat) {
            lineas.unshift(`<strong>Lectura especial</strong>`);
        }

        blockHtml += `
            <div class="holiday-item" style="margin-bottom: 8px; padding-bottom: 6px;">
                <div class="holiday-date" style="color: #1e293b; font-size: 0.9rem;">
                    📅 <strong>${dayName} ${dateKey}:</strong>
                </div>
                <div style="margin-left: 18px; margin-top: 2px; font-size: 0.88rem; color: #334155;">
                    ${lineas.join('<br>')}
                </div>
            </div>
        `;
    });

    return blockHtml;
}

// --- CALENDARIO MENSUAL ---
function toggleWeekStart() {
    startOnMonday = !startOnMonday;
    const btn = document.getElementById('btn-toggle-week-start');
    if (btn) {
        btn.innerText = startOnMonday 
            ? 'Cambiar a semana comenzando en domingo' 
            : 'Cambiar a semana comenzando en lunes';
    }
    loadMonthCalendar();
}

async function loadMonthCalendar() {
    const title = document.getElementById('month-title');
    const grid = document.getElementById('calendar-grid');

    if (!grid) return;

    const year = currentViewDate.getFullYear();
    const month = currentViewDate.getMonth();

    const monthSelect = document.getElementById('select-month-picker');
    const yearInput = document.getElementById('input-year-picker');
    if (monthSelect) monthSelect.value = month;
    if (yearInput) yearInput.value = year;

    const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    if (selectedCalDateKey && !selectedCalDateKey.startsWith(monthPrefix)) {
        selectedCalDateKey = null;
    }

    const monthName = currentViewDate.toLocaleString('es', { month: 'long' });
    const gregTitleText = `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${year}`;

    if (title) {
        title.innerHTML = gregTitleText;
    }

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 25px; color: #64748b;">Cargando calendario...</div>';

    let monthEvents = {};
    let daysHebrewData = {};
    let failedDaysCount = 0;

    try {
        const iParam = getIsraelParam();
        const resEv = await fetch(`https://www.hebcal.com/hebcal?v=1&cfg=json&maj=on&min=on&mod=on&mf=on&ss=on&s=on&c=on&m=on&nx=on&mvch=on&o=on&geo=pos&latitude=${userLocation.lat}&longitude=${userLocation.lng}&year=${year}&month=${month + 1}${iParam}`);
        const dataEv = await resEv.json();

        if (dataEv && dataEv.location && dataEv.location.tzid) {
            userLocation.tzid = dataEv.location.tzid;
        }

        if (dataEv && Array.isArray(dataEv.items)) {
            dataEv.items.forEach(item => {
                if (!item || !item.date) return;
                let evDate = item.date.split('T')[0];
                if (!monthEvents[evDate]) monthEvents[evDate] = [];
                monthEvents[evDate].push(item);
            });
        }

        const fetchPromises = [];
        for (let day = 1; day <= lastDay.getDate(); day++) {
            const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            fetchPromises.push(
                fetch(`https://www.hebcal.com/converter?cfg=json&gy=${year}&gm=${month + 1}&gd=${day}&g2h=1`)
                .then(r => r.json())
                .then(dataConv => {
                    if (dataConv && dataConv.hm) {
                        daysHebrewData[dateKey] = {
                            hd: dataConv.hd,
                            hm: traducirNombreMesHebreo(dataConv.hm),
                      hy: dataConv.hy
                        };
                    } else {
                        failedDaysCount++;
                    }
                })
                .catch(err => {
                    console.warn(`Fallo al convertir fecha del día ${dateKey}:`, err);
                    failedDaysCount++;
                })
            );
        }
        await Promise.all(fetchPromises);
    } catch(e) {
        console.error("Error cargando datos del mes:", e);
    }

    let uniqueHebrewMonthsYears = [];
    const firstDayKey = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDayKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;
    
    if (daysHebrewData[firstDayKey]) {
        uniqueHebrewMonthsYears.push(`${daysHebrewData[firstDayKey].hm} ${daysHebrewData[firstDayKey].hy}`);
    }
    if (daysHebrewData[lastDayKey]) {
        const labelLast = `${daysHebrewData[lastDayKey].hm} ${daysHebrewData[lastDayKey].hy}`;
        if (!uniqueHebrewMonthsYears.includes(labelLast)) {
            uniqueHebrewMonthsYears.push(labelLast);
        }
    }

    const hebrewHeaderStr = uniqueHebrewMonthsYears.join(' / ');
    if (title && hebrewHeaderStr) {
        title.innerHTML = `${gregTitleText}<br><span style="font-size: 0.85rem; font-weight: normal; color: #475569;">(${hebrewHeaderStr})</span>`;
    }
    if (title && failedDaysCount > 0) {
        title.innerHTML += `<br><span style="font-size: 0.75rem; color: #b91c1c;">⚠️ ${failedDaysCount} día(s) no cargaron correctamente</span>`;
    }

    grid.innerHTML = '';

    const headers = startOnMonday 
        ? ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
        : ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

    headers.forEach(h => {
        const div = document.createElement('div');
        div.className = 'cal-day-header';
        div.innerText = h;
        grid.appendChild(div);
    });

    let firstDayIndex = firstDay.getDay();
    if (startOnMonday) {
        firstDayIndex = (firstDayIndex === 0) ? 6 : firstDayIndex - 1;
    }

    for (let i = 0; i < firstDayIndex; i++) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'cal-day empty';
        grid.appendChild(emptyDiv);
    }

    let defaultSelectedNode = null;
    let defaultSelectedKey = null;

    for (let day = 1; day <= lastDay.getDate(); day++) {
        const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const div = document.createElement('div');
        div.className = 'cal-day';
        
        const curDate = new Date(year, month, day);
        const dayOfWeek = curDate.getDay();
        
        const dayEvents = monthEvents[dateKey] || [];
        const hasRealEvents = dayEvents.some(item => {
            if (!item) return false;
            if (item.category === 'omer' || (item.title && item.title.toLowerCase().includes('omer'))) return false;
            return true;
        });

        if (dayOfWeek === 6) {
            div.classList.add('bg-saturday');
        } else if (dayOfWeek === 5) {
            div.classList.add('bg-friday');
        } else if (hasRealEvents) {
            div.classList.add('bg-has-events');
        } else {
            div.classList.add('bg-no-events');
        }

        const today = new Date();
        const isToday = (day === today.getDate() && month === today.getMonth() && year === today.getFullYear());
        if (isToday) {
            div.classList.add('today');
        }

        let hebHtml = '';
        if (daysHebrewData[dateKey]) {
            let omerTxt = '';
            if (monthEvents[dateKey]) {
                const omerEv = monthEvents[dateKey].find(item => item && (item.category === 'omer' || (item.title && item.title.toLowerCase().includes('omer'))));
                if (omerEv) {
                    const omNum = omerEv.om || (omerEv.title && (omerEv.title.match(/\d+/) || [])[0]);
                    if (omNum) {
                        omerTxt = ` <span style="font-weight:normal; opacity:0.85;">(${omNum}-O)</span>`;
                    }
                }
            }
            hebHtml = `<div class="heb-num">${daysHebrewData[dateKey].hd}${omerTxt}</div>`;
        }

        div.innerHTML = `<div class="greg-num">${day}</div>${hebHtml}`;
        
        div.onclick = () => {
            document.querySelectorAll('.cal-day').forEach(el => el.classList.remove('selected'));
            div.classList.add('selected');
            selectedCalDateKey = dateKey;
            showDayDetails(dateKey, monthEvents[dateKey] || [], daysHebrewData[dateKey]);
        };

        if (!selectedCalDateKey && isToday) {
            defaultSelectedNode = div;
            defaultSelectedKey = dateKey;
        } else if (selectedCalDateKey === dateKey) {
            defaultSelectedNode = div;
            defaultSelectedKey = dateKey;
        }

        grid.appendChild(div);
    }

    if (defaultSelectedNode && defaultSelectedKey) {
        defaultSelectedNode.classList.add('selected');
        selectedCalDateKey = defaultSelectedKey;
        showDayDetails(defaultSelectedKey, monthEvents[defaultSelectedKey] || [], daysHebrewData[defaultSelectedKey]);
    } else {
        const firstValidKey = `${year}-${String(month + 1).padStart(2, '0')}-01`;
        const firstCell = grid.querySelector('.cal-day:not(.empty)');
        if (firstCell) {
            firstCell.classList.add('selected');
            selectedCalDateKey = firstValidKey;
            showDayDetails(firstValidKey, monthEvents[firstValidKey] || [], daysHebrewData[firstValidKey]);
        }
    }
}

function changeMonth(delta) {
    currentViewDate.setMonth(currentViewDate.getMonth() + delta);
    loadMonthCalendar();
}

function jumpToMonthYear() {
    const monthSelect = document.getElementById('select-month-picker');
    const yearInput = document.getElementById('input-year-picker');
    if (!monthSelect || !yearInput) return;

    const newMonth = parseInt(monthSelect.value, 10);
    const newYear = parseInt(yearInput.value, 10);

    if (isNaN(newMonth) || isNaN(newYear) || newYear < 1) return;

    currentViewDate = new Date(newYear, newMonth, 1);
    loadMonthCalendar();
}

function goToCurrentMonth() {
    currentViewDate = new Date();
    loadMonthCalendar();
}

function showDayDetails(dateKey, eventsList, hebData) {
    const titleElem = document.getElementById('selected-day-title');
    const eventsElem = document.getElementById('selected-day-events');
    
    if (!titleElem || !eventsElem) return;

    const [y, m, d] = dateKey.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const dayOfWeekStr = DIAS_SEMANA[getDayOfWeekLocal(dateObj)];
    const monthLongStr = dateObj.toLocaleDateString('es-ES', { month: 'long' });

    let hebStr = '';
    if (hebData && hebData.hd && hebData.hm && hebData.hy) {
        hebStr = ` (${hebData.hd} de ${hebData.hm} de ${hebData.hy})`;
    }

    titleElem.innerText = `📅 Eventos del ${dayOfWeekStr}, ${d} de ${monthLongStr} de ${y}${hebStr}`;

    let generalEvents = [];
    let timeEvents = [];
    let hasParashat = false;

    if (Array.isArray(eventsList)) {
        eventsList.forEach(ev => {
            if (!ev) return;
            let dObj = parseHebcalDate(ev.date);
            let hasTime = ev.date && ev.date.includes('T') && !ev.date.includes('T00:00:00') && !ev.date.includes('T02:00:00');
            let timeStr = hasTime ? ` • ⏰ ${formatTimeLocal(dObj)}` : '';
            
            let textoEv = traducirTexto(ev.title);
            if (ev.category === 'parashat' || textoEv.startsWith('Parashat')) {
                let nombreLimpio = textoEv.replace(/^Parashat\s+/i, '');
                textoEv = `Parashat ${obtenerEnlaceParasha(nombreLimpio)}`;
                hasParashat = true;
            }

            if (ev.category === 'candles' || ev.category === 'havdalah' || ev.category === 'zmanim' || hasTime) {
                timeEvents.push(`• ${textoEv}${timeStr}`);
            } else {
                generalEvents.push(`• ${textoEv}`);
            }
        });
    }

    const isSaturday = getDayOfWeekLocal(dateObj) === 6;
    if (isSaturday && !hasParashat) {
        generalEvents.push(`• Lectura especial`);
    }

    let allLines = [...generalEvents, ...timeEvents];

    if (allLines.length === 0) {
        eventsElem.innerHTML = '<div style="color: #64748b;"><em>Sin eventos destacados para este día.</em></div>';
        return;
    }

    let html = allLines.map(line => `<div style="margin-bottom: 6px;">${line}</div>`).join('');
    eventsElem.innerHTML = html;
}
