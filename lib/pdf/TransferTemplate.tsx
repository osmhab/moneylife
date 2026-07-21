//lib/pdf/TransferTemplate.tsx
import { 
    Document, 
    Page, 
    Text, 
    View, 
    StyleSheet, 
    Image 
  } from '@react-pdf/renderer';
  
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
    date: { 
      position: 'absolute', 
      top: '45mm', 
      left: '20mm' 
    },
    recipient: { 
      position: 'absolute', 
      top: '50mm', 
      left: '120mm', 
      width: '80mm',
    },
    subject: { 
      marginTop: '70mm', // Réduit de 80mm à 70mm pour gagner de la place
      fontWeight: 'bold', 
      fontSize: 12 
    },
    body: { 
      marginTop: '10mm', // Réduit de 15mm à 10mm
      lineHeight: 1.4    // Réduit de 1.5 à 1.4 pour compacter le texte
    },
    textBlock: {
      marginBottom: 10
    },
    // La zone de signature est maintenant en position absolue en bas de page
    // Elle ne "pousse" plus le contenu vers le bas
    signatureArea: { 
      position: 'absolute',
      bottom: '30mm',
      left: '20mm',
      width: '100mm',
    },
    signatureWrapper: {
      position: 'relative',
      height: 60, // Hauteur fixe pour le nom
      justifyContent: 'flex-end'
    },
    signatureImage: { 
      position: 'absolute',
      bottom: 0,        // L'image commence juste au-dessus du nom
      left: 0,
      width: 150,       // Largeur augmentée pour une signature plus visible
      height: 50,
      objectFit: 'contain',
      opacity: 0.9      // Légère transparence si elle chevauche le texte
    }
  });
  
  export const TransferTemplate = ({ client, details, signatureUrl }: any) => (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Entête */}
        <View style={styles.sender}>
          <Text>{client.firstName} {client.lastName}</Text>
          <Text>{client.address}</Text>
          <Text>{client.zip} {client.city}</Text>
        </View>
  
        <Text style={styles.date}>
          {client.city || "Vétroz"}, le {new Date().toLocaleDateString('fr-CH')}
        </Text>
  
        <View style={styles.recipient}>
          <Text>{details.oldInstitution}</Text>
          <Text>{details.oldAddress}</Text>
        </View>
  
        {/* Contenu */}
        <Text style={styles.subject}>
          Résiliation de mon contrat no {details.contractNumber} et transfert de mon avoir 3a existant
        </Text>
  
        <View style={styles.body}>
          <Text style={styles.textBlock}>Madame, Monsieur,</Text>
          <Text style={styles.textBlock}>
            Je vous prie de bien vouloir procéder au transfert de mon avoir 3a auprès de ma nouvelle 
            institution de prévoyance et résilier le contrat mentionné en objet à la date suivante :
          </Text>
          <Text style={{ fontWeight: 'bold', marginBottom: 10 }}>{details.transferDate}</Text>
          
          <Text style={styles.textBlock}>
            Vous trouverez en annexe toutes les informations utiles au bon déroulement de ce transfert.
          </Text>
          <Text>
            Dans l'attente de votre confirmation de versement, je vous prie d'agréer, Madame, 
            Monsieur, mes salutations les meilleures.
          </Text>
        </View>
  
        {/* Zone de Signature flottante */}
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