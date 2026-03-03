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

// SCANNER PER CAMPI SPECIFICI (Cliente, Vettore, ecc)
async function apriScannerPerCampo(id) {
    campoTarget = id;
    // Sposta l'utente sulla Tab 2 dove c'è il visualizzatore camera
    openTab({currentTarget: document.querySelectorAll('.tab-btn')[1]}, 'tab2');
    if (!isScanning) await toggleScanner();
    document.getElementById('qr-reader-container').scrollIntoView({behavior: "smooth"});
}

async function toggleScanner() {
    const container = document.getElementById('qr-reader-container');
    const btn = document.getElementById('btn-scan');
    
    if (!isScanning) {
        container.style.display = 'block';
        btn.innerText = "🛑 CHIUDI CAMERA";
        html5QrCode = new Html5Qrcode("qr-reader");
        try {
            await html5QrCode.start(
                { facingMode: "environment" }, 
                { fps: 10, qrbox: 250 },
                (text) => {
                    if (navigator.vibrate) navigator.vibrate(100);
                    
                    if (campoTarget === 'pannelli') {
                        addText(text);
                    } else {
                        // Inserisce il testo nel campo (cliente/vettore)
                        document.getElementById(campoTarget).value = text;
                        // Torna alla Tab 1 e chiude scanner
                        toggleScanner();
                        openTab({currentTarget: document.querySelectorAll('.tab-btn')[0]}, 'tab1');
                        campoTarget = 'pannelli'; // Reset
                    }
                }
            );
            isScanning = true;
        } catch (err) {
            alert("Errore camera: " + err);
        }
    } else {
        container.style.display = 'none';
        btn.innerText = "📷 SCANNER PACCHI";
        if (html5QrCode) await html5QrCode.stop();
        isScanning = false;
    }
}

function addText(val) {
    const area = document.getElementById('pannelli');
    area.value += val + "\n";
}

function addSpecial(tipo, valore) {
    datiSpeciali[tipo] += valore + ", ";
    addText(valore);
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
