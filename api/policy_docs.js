// api/policy_docs.js
// A consolidated file to handle all policy/documentation PDF requests

export default async function handler(req, res) {
    try {
      // Get the path to determine which document to serve
      const path = req.url;
      let pdfUrl = '';
      let filename = '';
      
      // Map the request path to the correct document URL and filename
      if (path.includes('/privacypolicy')) {
        pdfUrl = 'https://yok-ai-policies.s3.us-east-1.amazonaws.com/PRIVACY+POLICY.pdf';
        filename = 'privacy-policy.pdf';
      } 
      else if (path.includes('/termsofservice')) {
        pdfUrl = 'https://yok-ai-policies.s3.us-east-1.amazonaws.com/TERMS+OF+SERVICE.pdf';
        filename = 'terms_of_service.pdf';
      }
      else if (path.includes('/refundpolicy')) {
        pdfUrl = 'https://yok-ai-policies.s3.us-east-1.amazonaws.com/REFUND+POLICY.pdf';
        filename = 'refund-policy.pdf';
      }
      else if (path.includes('/cookies')) {
        pdfUrl = 'https://yok-ai-policies.s3.us-east-1.amazonaws.com/COOKIES+POLICY.pdf';
        filename = 'cookies-policy.pdf';
      }
      else if (path.includes('/docs')) {
        pdfUrl = 'https://yok-ai-policies.s3.us-east-1.amazonaws.com/Yok-AI_+Technical+Documentation.pdf';
        filename = 'documents.pdf';
      }
      else {
        throw new Error('Document not found');
      }
      
      // Fetch the PDF from S3
      const response = await fetch(pdfUrl);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch PDF: ${response.status}`);
      }
      
      // Get the PDF data as an array buffer
      const pdfData = await response.arrayBuffer();
      
      // Set appropriate headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      
      // Send the PDF data
      res.status(200).send(Buffer.from(pdfData));
    } catch (error) {
      console.error('Error serving PDF:', error);
      res.status(500).send('Error fetching the document');
    }
  }