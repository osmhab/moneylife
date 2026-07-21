//lib/pdf/Termination3bTemplate.tsx
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';

const styles = StyleSheet.create({
    page: { 
      padding: '20mm', 
      fontSize: 11, 
      fontFamily: 'Helvetica', 
      color: '#0b1220' 
    },
    sender: { 
      position: 'absolute', 
      top: '20mm', 
      left: '20mm', 
      width: '80mm' 
    },
    recipient: { 
      position: 'absolute', 
      top: '50mm',
      left: '120mm',
      width: '80mm' 
    },
    date: { 
      position: 'absolute', 
      top: '45mm', 
      left: '20mm' 
    },
    subject: { 
      marginTop: '70mm', 
      fontWeight: 'bold', 
      fontSize: 12, 
      textDecoration: 'underline' 
    },
    body: { 
      marginTop: '10mm', 
      lineHeight: 1.5 
    },
    ibanBox: { 
      marginVertical: 15, 
      padding: 10, 
      backgroundColor: '#f1f5f9', 
      border: '1px solid #e2e8f0' 
    },
    signatureArea: { 
      position: 'absolute',
      bottom: '30mm',
      left: '20mm',
      width: '100mm',
    },
    signatureWrapper: {
      position: 'relative',
      height: 60,
      justifyContent: 'flex-end'
    },
    signatureImage: { 
      position: 'absolute',
      bottom: 5,
      left: 0,
      width: 150, 
      height: 60,
      objectFit: 'contain',
      opacity: 0.9
    }
  });

export const Termination3bTemplate = ({ client, details, signatureUrl }: any) => (
  <Document>
    <Page size="A4" style={styles.page}>
      <View style={styles.sender}>
        <Text>{client.firstName} {client.lastName}</Text>
        <Text>{client.address}</Text>
        <Text>{client.zip} {client.city}</Text>
      </View>

      <View style={styles.recipient}>
        <Text>{details.oldInstitution}</Text>
        <Text>{details.oldAddress}</Text>
      </View>

      <Text style={styles.date}>{client.city || "Ville"}, le {new Date().toLocaleDateString('fr-CH')}</Text>

      <Text style={styles.subject}>
        Résiliation et rachat total de ma police de 3ème pilier B n° {details.contractNumber}
      </Text>

      <View style={styles.body}>
        <Text>Madame, Monsieur,</Text>
        <Text style={{ marginTop: 10 }}>
          Par la présente, je résilie avec effet au {details.transferDate} (ou pour la prochaine échéance possible) mon contrat mentionné en objet.
        </Text>
        <Text style={{ marginTop: 10 }}>
          Je vous prie de bien vouloir procéder au rachat total de ma police et de verser la valeur de rachat ainsi que les participations aux excédents sur mon compte bancaire :
        </Text>
        
        <View style={styles.ibanBox}>
          <Text style={{ fontWeight: 'bold' }}>IBAN : {details.iban}</Text>
          <Text>Bénéficiaire : {client.firstName} {client.lastName}</Text>
        </View>

        <Text>
          Je vous remercie de m'adresser une confirmation écrite de cette résiliation ainsi que le décompte final.
        </Text>
        <Text style={{ marginTop: 15 }}>Dans l'attente, je vous prie d'agréer, Madame, Monsieur, mes salutations les meilleures.</Text>
      </View>

      {/* AJUSTÉ : On utilise la même structure de wrapper que dans le 3a */}
      <View style={styles.signatureArea}>
        <View style={styles.signatureWrapper}>
          {signatureUrl && (
            <Image src={signatureUrl} style={styles.signatureImage} />
          )}
          <Text>{client.firstName} {client.lastName}</Text>
        </View>
      </View>
    </Page>
  </Document>
);