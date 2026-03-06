const SB_URL = "https://vnzrewcbnoqbqvzckome.supabase.co"; 
const SB_KEY = "sb_publishable_Sq9txbu-PmKdbxETSx2cjw_WqWEFBPO";
const supabaseClient = supabase.createClient(SB_URL, SB_KEY);

let html5QrCode;
let isScanning = false;
let campoTarget = 'pannelli';
let datiSpeciali = { spine: "", accessori: "" };
// Gestione cooldown scansioni pannelli
let lastScanTime = 0;
const SCAN_COOLDOWN_MS = 3000;

// NAVIGAZIONE
function openTab(evt, tabId) {
    document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).style.display = 'block';
    if(evt) evt.currentTarget.classList.add('active');
}

// ... (Configurazione Supabase e datiSpeciali rimangono uguali) ...

async function apriScannerPerCampo(id) {
    campoTarget = id;
    // Quando apriamo lo scanner sui pannelli, azzeriamo il cooldown
    if (campoTarget === 'pannelli') {
        lastScanTime = 0;
    }
    const container = document.getElementById('qr-reader-container');
    
    // Mostriamo il contenitore PRIMA di avviare la camera
    container.style.display = 'block';
    window.scrollTo(0, 0); 

    if (!html5QrCode) {
        html5QrCode = new Html5Qrcode("qr-reader");
    }

    try {
        isScanning = true;
        await html5QrCode.start(
            { facingMode: "environment" }, 
            { fps: 10, qrbox: { width: 250, height: 250 } },
            (text) => {
                if (campoTarget === 'pannelli') {
                    const now = Date.now();
                    // Se è passato meno del cooldown dall'ultima scansione, ignora
                    if (now - lastScanTime < SCAN_COOLDOWN_MS) {
                        return;
                    }
                    lastScanTime = now;

                    if (navigator.vibrate) navigator.vibrate(100);
                    addText(text);
                } else {
                    if (navigator.vibrate) navigator.vibrate(100);
                    document.getElementById(campoTarget).value = text;
                    toggleScanner(); // Chiude per i campi singoli
                }
            }
        );
    } catch (err) {
        console.error(err);
        alert("Impossibile avviare la fotocamera. Verifica i permessi.");
    }
}

async function toggleScanner() {
    const container = document.getElementById('qr-reader-container');
    if (isScanning && html5QrCode) {
        try {
            await html5QrCode.stop();
            container.style.display = 'none';
            isScanning = false;
        } catch (err) {
            console.error(err);
        }
    } else {
        apriScannerPerCampo('pannelli');
    }
}

function addText(val) {
    const area = document.getElementById('pannelli');
    if (area) {
        area.value += val + "\n";
        area.scrollTop = area.scrollHeight; // Porta il cursore alla fine
    }
}

function addSpecial(tipo, valore) {
    if (!valore) return;

    let testoDaInserire = valore;

    if (tipo === 'spine') {
        // Popup per le spine (Metri Lineari)
        let ml = prompt(`Inserisci i metri lineari (ml) per ${valore}:`, "");
        
        if (ml === null || ml.trim() === "") return; 
        
        testoDaInserire = `${valore} ml ${ml}`;
        datiSpeciali.spine += testoDaInserire + ", ";

    } else if (tipo === 'accessori') {
        // Popup per gli accessori (Note o Quantità)
        let note = prompt(`Aggiungi una nota o quantità per ${valore}:`, "");
        
        // Se l'utente preme OK senza scrivere nulla, aggiungiamo solo l'accessorio.
        // Se preme ANNULLA, non aggiungiamo nulla.
        if (note === null) return; 

        if (note.trim() !== "") {
            testoDaInserire = `${valore} (${note})`;
        } else {
            testoDaInserire = valore;
        }
        
        datiSpeciali.accessori += testoDaInserire + ", ";
        
        // Reset della tendina HTML
        const select = document.getElementById('selectAccessori');
        if (select) select.value = "";
    }

    // Aggiunta al campo di testo principale
    addText(testoDaInserire);
}
// --- GENERAZIONE E INVIO (SISTEMA RAPPORTINI) ---
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
        const nomeFilePDF = `Carico_${cliente.replace(/\s+/g, '_')}_${Date.now()}.pdf`;

        // Costruzione PDF
        doc.setFontSize(20); doc.setTextColor(0, 74, 153);
        doc.text("RAPPORTO CARICO MERCI", 105, 20, {align: 'center'});
        doc.setFontSize(12); doc.setTextColor(0);
        doc.text(`Data: ${dataCarico} | Operatore: ${operatore}`, 20, 40);
        doc.text(`Cliente: ${cliente}`, 20, 50);
        doc.text(`Vettore: ${document.getElementById('vettore').value}`, 20, 60);
        doc.line(20, 65, 190, 65);
        const lista = doc.splitTextToSize(document.getElementById('pannelli').value, 170);
        doc.text(lista, 20, 75);

        // Aggiunta Foto (Logica Rapportini)
        const fotoFiles = document.getElementById('fotoInput').files;
        for (let i = 0; i < fotoFiles.length; i++) {
            const imgData = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.readAsDataURL(fotoFiles[i]);
            });
            doc.addPage();
            doc.addImage(imgData, 'JPEG', 15, 30, 180, 135);
        }

        const pdfBlob = doc.output('blob');
        const pdfBase64 = doc.output('datauristring').split(',')[1];

        // 1. STORAGE
        await supabaseClient.storage.from('documenti-carico').upload(nomeFilePDF, pdfBlob);

        // 2. DATABASE
        const { error: dbError } = await supabaseClient.from('carichi').insert([{
            operatore: operatore,
            vettore: document.getElementById('vettore').value,
            cliente: cliente,
            destinazione: document.getElementById('destinazione').value,
            pannelli: document.getElementById('pannelli').value,
            spine: datiSpeciali.spine,
            accessori: datiSpeciali.accessori,
            foto_nome: nomeFilePDF,
            processato: false
        }]);
        if (dbError) throw dbError;

        // 3. EMAIL (RESEND)
        const emailRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer re_9vyoQUPF_AGCtEg6ALeFDzcyavtiKz4iq'
            },
            body: JSON.stringify({
                from: 'App Carico <onboarding@resend.dev>',
                to: ['l.damario@pannellitermici.it'],
                subject: `Carico: ${cliente}`,
                html: `<p>Nuovo carico salvato nel database.</p>`,
                attachments: [{ filename: nomeFilePDF, content: pdfBase64 }]
            })
        });

        if (emailRes.ok) {
            alert("✅ Tutto inviato con successo!");
            location.reload();
        } else {
            throw new Error("Errore invio email");
        }

    } catch (err) {
        alert("Errore: " + err.message);
    } finally {
        btn.disabled = false;
        btn.innerText = "🚀 INVIA E SALVA CARICO";
    }
}