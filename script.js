// CONFIGURAZIONE
const SB_URL = "https://vnzrewcbnoqbqvzckome.supabase.co"; 
const SB_KEY = "sb_publishable_Sq9txbu-PmKdbxETSx2cjw_WqWEFBPO";
const supabaseClient = supabase.createClient(SB_URL, SB_KEY);

let html5QrCode;
let isScanning = false;
let campoTarget = 'pannelli'; // Default
let datiSpeciali = { spine: "", accessori: "" };

// --- GESTIONE SCANNER UNIVERSALE ---
async function attivaScannerPerCampo(id) {
    campoTarget = id;
    const container = document.getElementById('qr-reader-container');
    container.style.display = 'block';
    if (!isScanning) {
        startScanner();
    }
    container.scrollIntoView({behavior: "smooth"});
}

async function toggleScanner() {
    campoTarget = 'pannelli';
    const container = document.getElementById('qr-reader-container');
    if (!isScanning) {
        container.style.display = 'block';
        startScanner();
    } else {
        container.style.display = 'none';
        if (html5QrCode) await html5QrCode.stop();
        isScanning = false;
    }
}

function startScanner() {
    isScanning = true;
    html5QrCode = new Html5Qrcode("qr-reader");
    html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, (text) => {
        if (navigator.vibrate) navigator.vibrate(100);
        
        if (campoTarget === 'pannelli') {
            addText(text); // Aggiunge alla lista textarea
        } else {
            document.getElementById(campoTarget).value = text;
            toggleScanner(); // Chiude lo scanner per i campi singoli
        }
    }).catch(err => console.error("Errore scanner:", err));
}

// --- LOGICA DATI ---
function addText(val) {
    const area = document.getElementById('pannelli');
    area.value += val + "\n";
    area.scrollTop = area.scrollHeight;
}

function addSpecial(tipo, valore) {
    datiSpeciali[tipo] += valore + ", ";
    addText(valore); // Visibile anche in textarea
}

// --- GENERAZIONE E INVIO (REPLICA RAPPORTINI) ---
async function generaEInvia() {
    const btn = document.querySelector('.btn-send');
    btn.innerText = "⏳ INVIO IN CORSO...";
    btn.disabled = true;

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        const cliente = document.getElementById('cliente').value || "Generico";
        const operatore = document.getElementById('operatore').value;
        const dataCarico = document.getElementById('dataCarico').value;
        const timestamp = Date.now();
        const nomeFilePDF = `Carico_${cliente.replace(/\s+/g, '_')}_${timestamp}.pdf`;

        // Costruzione PDF (Intestazione)
        doc.setFontSize(22); doc.setTextColor(0, 74, 153);
        doc.text("RAPPORTO CARICO MERCI", 105, 20, {align: 'center'});
        
        doc.setFontSize(12); doc.setTextColor(0);
        doc.text(`Data: ${dataCarico}`, 20, 40);
        doc.text(`Operatore: ${operatore}`, 20, 50);
        doc.text(`Vettore: ${document.getElementById('vettore').value}`, 20, 60);
        doc.text(`Cliente: ${cliente}`, 20, 70);
        doc.text(`Destinazione: ${document.getElementById('destinazione').value}`, 20, 80);
        
        doc.line(20, 85, 190, 85);
        doc.text("DETTAGLIO CARICO:", 20, 95);
        const splitLista = doc.splitTextToSize(document.getElementById('pannelli').value, 170);
        doc.text(splitLista, 20, 105);

        // Aggiunta Foto
        const fotoFiles = document.getElementById('fotoInput').files;
        for (let i = 0; i < fotoFiles.length; i++) {
            const imgData = await new Promise(resolve => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.readAsDataURL(fotoFiles[i]);
            });
            doc.addPage();
            doc.text(`FOTO ALLEGATA ${i+1}`, 105, 15, {align: 'center'});
            doc.addImage(imgData, 'JPEG', 15, 30, 180, 135);
        }

        const pdfBlob = doc.output('blob');
        const pdfBase64 = doc.output('datauristring').split(',')[1];

        // --- STEP A: UPLOAD STORAGE ---
        console.log("Caricamento Storage...");
        await supabaseClient.storage.from('documenti-carico').upload(nomeFilePDF, pdfBlob);

        // --- STEP B: SALVATAGGIO DATABASE ---
        console.log("Salvataggio DB...");
        const { error: dbError } = await supabaseClient.from('carichi').insert([{
            operatore: operatore,
            vettore: document.getElementById('vettore').value,
            cliente: cliente,
            destinazione: document.getElementById('destinazione').value,
            pannelli: document.getElementById('pannelli').value,
            spine: datiSpeciali.spine,
            accessori: datiSpeciali.accessori,
            foto_nome: nomeFilePDF, // Riferimento al file nello storage
            processato: false
        }]);
        if (dbError) throw dbError;

        // --- STEP C: INVIO VIA RESEND (Stessa logica rapportini) ---
        console.log("Invio Email...");
        const emailRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer re_9vyoQUPF_AGCtEg6ALeFDzcyavtiKz4iq'
            },
            body: JSON.stringify({
                from: 'App Carico <onboarding@resend.dev>',
                to: ['l.damario@pannellitermici.it'],
                subject: `Nuovo Carico: ${cliente} - Op: ${operatore}`,
                html: `<p>Generato rapporto di carico per <strong>${cliente}</strong>.</p>`,
                attachments: [{ filename: nomeFilePDF, content: pdfBase64 }]
            })
        });

        if (emailRes.ok) {
            alert("✅ Carico salvato, PDF archiviato e Email inviata!");
            doc.save(nomeFilePDF);
            location.reload(); // Reset app
        } else {
            alert("⚠️ Salvato nel Cloud, ma errore nell'invio email.");
        }

    } catch (err) {
        console.error(err);
        alert("❌ Errore critico: " + err.message);
    } finally {
        btn.innerText = "🚀 INVIA E SALVA CARICO";
        btn.disabled = false;
    }
}
