// api/privacypolicy.js
export default async function handler(req, res) {
    try {
      // Fetch the PDF from S3
      const response = await fetch('https://yok-ai-policies.s3.us-east-1.amazonaws.com/TERMS+OF+SERVICE.pdf');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch PDF: ${response.status}`);
      }
      
      // Get the PDF data as an array buffer
      const pdfData = await response.arrayBuffer();
      
      // Set appropriate headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="terms_of_service.pdf"');
      
      // Send the PDF data
      res.status(200).send(Buffer.from(pdfData));
    } catch (error) {
      console.error('Error serving PDF:', error);
      res.status(500).send('Error fetching the document');
    }
  }