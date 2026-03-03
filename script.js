const SB_URL = "https://vnzrewcbnoqbqvzckome.supabase.co"; 
const SB_KEY = "sb_publishable_Sq9txbu-PmKdbxETSx2cjw_WqWEFBPO";
const supabaseClient = supabase.createClient(SB_URL, SB_KEY);

let html5QrCode;
let isScanning = false;
let campoTarget = 'pannelli';
let datiSpeciali = { spine: "", accessori: "" };

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
                if (navigator.vibrate) navigator.vibrate(100);
                
                if (campoTarget === 'pannelli') {
                    addText(text);
                } else {
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
        const vettore = document.getElementById('vettore').value || "N/D";
        const destinazione = document.getElementById('destinazione').value || "N/D";
        const pannelli = document.getElementById('pannelli').value;

        // --- PAGINA 1: DATI ---
        doc.setFontSize(22); doc.setTextColor(0, 74, 153);
        doc.text("DOCUMENTO DI CARICO", 105, 20, {align: 'center'});
        
        doc.setFontSize(12); doc.setTextColor(0);
        doc.text(`Data: ${dataCarico}`, 20, 40);
        doc.text(`Operatore: ${operatore}`, 20, 48);
        doc.text(`Cliente: ${cliente}`, 20, 56);
        doc.text(`Vettore: ${vettore}`, 20, 64);
        doc.text(`Destinazione: ${destinazione}`, 20, 72);
        
        doc.line(20, 78, 190, 78);
        doc.text("DETTAGLIO CARICO:", 20, 85);
        const splitPannelli = doc.splitTextToSize(pannelli, 170);
        doc.text(splitPannelli, 20, 92);

        // --- PAGINE SUCCESSIVE: FOTO MULTIPLE ---
        const fotoFiles = document.getElementById('fotoInput').files;
        if (fotoFiles.length > 0) {
            for (let i = 0; i < fotoFiles.length; i++) {
                const imgData = await new Promise(resolve => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target.result);
                    reader.readAsDataURL(fotoFiles[i]);
                });
                doc.addPage();
                doc.text(`FOTO ALLEGATA ${i+1}`, 105, 20, {align: 'center'});
                doc.addImage(imgData, 'JPEG', 15, 30, 180, 135);
            }
        }

        const pdfBlob = doc.output('blob');
        const fileName = `${Date.now()}_Carico_${cliente.replace(/\s+/g, '_')}.pdf`;

        // 1. UPLOAD SU STORAGE (Bucket: documenti-carico)
        const { error: storageError } = await supabaseClient.storage
            .from('documenti-carico')
            .upload(fileName, pdfBlob);
        if (storageError) throw storageError;

        // 2. URL PUBBLICO
        const { data: urlData } = supabaseClient.storage.from('documenti-carico').getPublicUrl(fileName);
        const pdfUrl = urlData.publicUrl;

        // 3. SALVATAGGIO DB
        const { error: dbError } = await supabaseClient.from('carichi').insert([{
            operatore, vettore, cliente, destinazione, pannelli,
            spine: datiSpeciali.spine,
            accessori: datiSpeciali.accessori,
            pdf_url: pdfUrl,
            foto_nome: fileName
        }]);
        if (dbError) throw dbError;

        // 4. CHIAMATA ALLA NUOVA EDGE FUNCTION
        const { data, error: funcError } = await supabaseClient.functions.invoke('send-email-carico', {
            body: { 
                operatore, 
                cliente, 
                vettore,
                pdfUrl, 
                fileName 
            }
        });

        if (funcError) throw funcError;

        alert("✅ Carico inviato e salvato con successo!");
        location.reload();

    } catch (err) {
        console.error(err);
        alert("❌ Errore: " + err.message);
    } finally {
        btn.disabled = false;
        btn.innerText = "🚀 GENERA PDF E INVIA";
    }
}

