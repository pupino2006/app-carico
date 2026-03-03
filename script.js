// 1. CONFIGURAZIONE (Usa le tue chiavi reali)
const SB_URL = "https://vnzrewcbnoqbqvzckome.supabase.co"; 
const SB_KEY = "sb_publishable_Sq9txbu-PmKdbxETSx2cjw_WqWEFBPO";
const supabaseClient = supabase.createClient(SB_URL, SB_KEY);

let html5QrCode;
let isScanning = false;
let dbArticoli = [];
let campoTarget = 'pannelli'; // Default sulla lista articoli

// 2. CARICAMENTO DATABASE ARTICOLI (CSV)
async function caricaDatabase() {
    try {
        const response = await fetch('DB Articoli.csv');
        const data = await response.text();
        const rows = data.split('\n').slice(1); 
        dbArticoli = rows.map(row => {
            const cols = row.split(';');
            return { codice: cols[1]?.trim(), descrizione: cols[2]?.trim() };
        });
        console.log("Database Articoli caricato");
    } catch (err) {
        console.error("Errore caricamento CSV:", err);
    }
}

// 3. NAVIGAZIONE TAB
function openTab(evt, tabId) {
    document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).style.display = 'block';
    if(evt) evt.currentTarget.classList.add('active');
}

// 4. LOGICA SCANNER UNIVERSALE
async function attivaScannerPerCampo(idCampo) {
    campoTarget = idCampo;
    const container = document.getElementById('qr-reader-container');
    const btn = document.getElementById('btn-scan');

    // Mostra il contenitore dello scanner e avvia
    container.style.display = 'block';
    btn.innerText = "🛑 CHIUDI SCANNER";
    btn.style.background = "#dc3545";
    
    if (!isScanning) {
        startScanner();
        isScanning = true;
    }
    // Scroll automatico alla telecamera
    container.scrollIntoView({behavior: "smooth"});
}

async function toggleScanner() {
    if (isScanning) {
        const container = document.getElementById('qr-reader-container');
        const btn = document.getElementById('btn-scan');
        container.style.display = 'none';
        btn.innerText = "📷 ATTIVA SCANNER QR";
        btn.style.background = "#ffc107";
        if (html5QrCode) await html5QrCode.stop();
        isScanning = false;
    } else {
        attivaScannerPerCampo('pannelli');
    }
}

function startScanner() {
    html5QrCode = new Html5Qrcode("qr-reader");
    html5QrCode.start(
        { facingMode: "environment" }, 
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
            if (navigator.vibrate) navigator.vibrate(100);

            if (campoTarget === 'pannelli') {
                // Se è la lista pacchi, cerca nel DB e aggiungi
                addText(decodedText);
                // Pausa breve per non leggere 10 volte lo stesso pacco
                html5QrCode.pause();
                setTimeout(() => html5QrCode.resume(), 1500);
            } else {
                // Se è un campo singolo (cliente, vettore), scrivi e chiudi
                document.getElementById(campoTarget).value = decodedText;
                toggleScanner();
            }
        }
    ).catch(err => console.error(err));
}

// 5. FUNZIONI DI INSERIMENTO TESTO
function addText(valore) {
    const area = document.getElementById('pannelli');
    const articolo = dbArticoli.find(a => a.codice === valore.trim());
    const testoDaInserire = articolo ? `${articolo.codice} - ${articolo.descrizione}` : valore;

    area.value += testoDaInserire + "\n";
    area.scrollTop = area.scrollHeight; 
    area.focus();
}

function addAccessorio() {
    const sel = document.getElementById('selectAccessori');
    if(sel.value !== "") {
        addText(sel.value);
        sel.value = ""; 
    }
}

// 6. ANTEPRIMA FOTO
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

// 7. GENERAZIONE PDF E INVIO (SISTEMA RAPPORTINI)
async function generaEInvia() {
    const btn = document.querySelector('.btn-send');
    btn.disabled = true;
    btn.innerText = "INVIO IN CORSO...";

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const cliente = document.getElementById('cliente').value || "Generico";
        const operatore = document.getElementById('operatore').value;
        const dataCarico = document.getElementById('dataCarico').value;

        // COSTRUZIONE PDF
        doc.setFontSize(20);
        doc.setTextColor(0, 74, 153);
        doc.text("RAPPORTO CARICO MERCI", 105, 20, {align: 'center'});
        
        doc.setFontSize(12);
        doc.setTextColor(0);
        doc.text(`Data: ${dataCarico}`, 20, 40);
        doc.text(`Operatore: ${operatore}`, 20, 50);
        doc.text(`Vettore/Targa: ${document.getElementById('vettore').value}`, 20, 60);
        doc.text(`Cliente: ${cliente}`, 20, 70);
        doc.text(`Destinazione: ${document.getElementById('destinazione').value}`, 20, 80);
        
        doc.line(20, 85, 190, 85);
        doc.text("DETTAGLIO CARICO:", 20, 95);
        const lista = doc.splitTextToSize(document.getElementById('pannelli').value, 170);
        doc.text(lista, 20, 105);

        // AGGIUNTA FOTO
        const files = document.getElementById('fotoInput').files;
        for (let i = 0; i < files.length; i++) {
            const imgData = await new Promise(resolve => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.readAsDataURL(files[i]);
            });
            doc.addPage();
            doc.addImage(imgData, 'JPEG', 15, 30, 180, 135);
            doc.text(`ALLEGATO FOTOGRAFICO ${i+1}`, 105, 15, {align: 'center'});
        }

        const pdfBase64 = doc.output('datauristring');

        // --- STEP A: SALVATAGGIO SUPABASE ---
        const { error: dbError } = await supabaseClient.from('carichi').insert([{
            operatore: operatore,
            cliente: cliente,
            pannelli: document.getElementById('pannelli').value,
            processato: false
        }]);
        if (dbError) throw dbError;

        // --- STEP B: INVIO EMAIL RESEND ---
        const emailRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer re_9vyoQUPF_AGCtEg6ALeFDzcyavtiKz4iq'
            },
            body: JSON.stringify({
                from: 'App Carico <onboarding@resend.dev>',
                to: ['l.damario@pannellitermici.it'],
                subject: `Carico Merci: ${cliente} - ${dataCarico}`,
                html: `<p>Nuovo carico effettuato da <strong>${operatore}</strong> per <strong>${cliente}</strong>.</p>`,
                attachments: [{
                    filename: `Carico_${cliente}.pdf`,
                    content: pdfBase64.split(',')[1]
                }]
            })
        });

        if (emailRes.ok) {
            alert("✅ Carico salvato e inviato via Email!");
            doc.save(`CARICO_${cliente}.pdf`);
        } else {
            alert("Dati salvati, ma errore invio email.");
        }

    } catch (err) {
        alert("Errore: " + err.message);
    } finally {
        btn.disabled = false;
        btn.innerText = "🚀 GENERA PDF E INVIA";
    }
}

window.onload = () => {
    document.getElementById('dataCarico').value = new Date().toISOString().split('T')[0];
    caricaDatabase();
    openTab(null, 'tab1');
};
