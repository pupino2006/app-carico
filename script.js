// 1. CONFIGURAZIONE SUPABASE
const SB_URL = "https://TUO_ID.supabase.co"; // <-- SOSTITUISCI CON IL TUO URL
const SB_KEY = "sb_publishable_Sq9txbu-PmKdbxETSx2cjw_WqWEFBPO";
const supabaseClient = supabase.createClient(SB_URL, SB_KEY);

let html5QrCode;
let isScanning = false;
let dbArticoli = [];

// 2. CARICAMENTO DATABASE ARTICOLI (CSV)
async function caricaDatabase() {
    try {
        const response = await fetch('DB Articoli.csv');
        const data = await response.text();
        const rows = data.split('\n').slice(1); // Salta l'intestazione
        dbArticoli = rows.map(row => {
            const cols = row.split(';');
            return { codice: cols[1], descrizione: cols[2] };
        });
        console.log("Database Articoli caricato con successo");
    } catch (err) {
        console.error("Errore caricamento DB Articoli:", err);
    }
}

// Navigazione tra le schede (Tabs)
function openTab(evt, tabId) {
    document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).style.display = 'block';
    evt.currentTarget.classList.add('active');
}

// Funzione per aggiungere testo, andare a capo e cercare nel DB
function addText(valore) {
    const area = document.getElementById('pannelli');
    
    // Cerca se il codice esiste nel database
    const articolo = dbArticoli.find(a => a.codice === valore.trim());
    const testoDaInserire = articolo ? `${articolo.codice} - ${articolo.descrizione}` : valore;

    area.value += testoDaInserire + "\n";
    area.scrollTop = area.scrollHeight; 
    area.focus();
}

// Gestione Accessori dalla tendina
function addAccessorio() {
    const sel = document.getElementById('selectAccessori');
    if(sel.value !== "") {
        addText(sel.value);
        sel.value = ""; // Reset tendina
    }
}

// --- GESTIONE SCANNER QR ---
async function toggleScanner() {
    const container = document.getElementById('qr-reader-container');
    const btn = document.getElementById('btn-scan');

    if (!isScanning) {
        container.style.display = 'block';
        btn.innerText = "🛑 DISATTIVA SCANNER";
        btn.style.background = "#dc3545";
        btn.style.color = "white";
        startScanner();
        isScanning = true;
    } else {
        container.style.display = 'none';
        btn.innerText = "📷 ATTIVA SCANNER QR";
        btn.style.background = "#ffc107";
        btn.style.color = "black";
        if (html5QrCode) {
            await html5QrCode.stop();
        }
        isScanning = false;
    }
}

function startScanner() {
    html5QrCode = new Html5Qrcode("qr-reader");
    const config = { 
        fps: 10, 
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0 
    };

    html5QrCode.start(
        { facingMode: "environment" }, 
        config,
        (decodedText) => {
            addText(decodedText);
            if (navigator.vibrate) navigator.vibrate(100);
            
            // Pausa per evitare letture doppie immediate
            html5QrCode.pause();
            setTimeout(() => html5QrCode.resume(), 1500);
        }
    ).catch(err => {
        alert("Errore fotocamera: " + err);
    });
}

// --- ANTEPRIMA FOTO ---
document.getElementById('fotoInput').onchange = function(e) {
    const preview = document.getElementById('preview');
    preview.innerHTML = "";
    Array.from(e.target.files).forEach(file => {
        const reader = new FileReader();
        reader.onload = (ex) => {
            const img = document.createElement('img');
            img.src = ex.target.result;
            preview.appendChild(img);
        };
        reader.readAsDataURL(file);
    });
};

// --- GENERAZIONE PDF E INVIO ---
async function generaEInvia() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const cliente = document.getElementById('cliente').value || "Generico";
    
    // 1. COSTRUZIONE PDF (Pagina 1)
    doc.setFontSize(22);
    doc.setTextColor(0, 74, 153);
    doc.text("RAPPORTO CARICO MERCI", 105, 20, {align: 'center'});
    
    doc.setFontSize(12);
    doc.setTextColor(0);
    const yStart = 40;
    doc.text(`Data: ${document.getElementById('dataCarico').value}`, 20, yStart);
    doc.text(`Operatore: ${document.getElementById('operatore').value}`, 20, yStart + 10);
    doc.text(`Vettore: ${document.getElementById('vettore').value}`, 20, yStart + 20);
    doc.text(`Cliente: ${cliente}`, 20, yStart + 30);
    doc.text(`Destinazione: ${document.getElementById('destinazione').value}`, 20, yStart + 40);
    
    doc.setLineWidth(0.5);
    doc.line(20, yStart + 45, 190, yStart + 45);
    doc.text("ELENCO CARICO:", 20, yStart + 55);
    
    const lista = doc.splitTextToSize(document.getElementById('pannelli').value, 170);
    doc.text(lista, 20, yStart + 65);

    // 2. AGGIUNTA FOTO (Pagine successive)
    const files = document.getElementById('fotoInput').files;
    for (let i = 0; i < files.length; i++) {
        const imgData = await new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(files[i]);
        });
        doc.addPage();
        doc.text(`FOTO ALLEGATA ${i+1}`, 105, 15, {align: 'center'});
        doc.addImage(imgData, 'JPEG', 15, 30, 180, 135);
    }

    // 3. INVIO A SUPABASE
    const { error } = await supabaseClient.from('carichi').insert([{
        operatore: document.getElementById('operatore').value,
        cliente: cliente,
        pannelli: document.getElementById('pannelli').value,
        processato: false
    }]);

    if(!error) {
        alert("✅ Dati salvati su Supabase!");
        doc.save(`CARICO_${cliente}.pdf`);
    } else {
        alert("Errore Supabase: " + error.message);
    }
}

// Inizializzazione al caricamento
window.onload = () => {
    document.getElementById('dataCarico').value = new Date().toISOString().split('T')[0];
    caricaDatabase();
};