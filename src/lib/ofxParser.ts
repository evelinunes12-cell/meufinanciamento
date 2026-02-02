export interface OFXTransaction {
  date: Date;
  amount: number;
  description: string;
  fitid: string;
}

/**
 * Parse OFX file content and extract transactions
 * @param content - Raw OFX file content as string
 * @returns Array of parsed transactions
 */
export function parseOFX(content: string): OFXTransaction[] {
  const transactions: OFXTransaction[] = [];
  
  // Normalize line endings and clean up content
  const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  // Find all STMTTRN blocks (statement transactions)
  const stmttrnRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  const matches = normalizedContent.matchAll(stmttrnRegex);
  
  for (const match of matches) {
    const block = match[1];
    
    // Extract DTPOSTED (date) - format: YYYYMMDD or YYYYMMDDHHMMSS
    const dateMatch = block.match(/<DTPOSTED>\s*(\d{8})/i);
    
    // Extract TRNAMT (amount) - handles negative, positive, with comma or dot
    const amountMatch = block.match(/<TRNAMT>\s*([-+]?[\d.,]+)/i);
    
    // Extract MEMO (primary description from bank)
    const memoMatch = block.match(/<MEMO>\s*([^\n<]+)/i);
    
    // Extract NAME (alternative description)
    const nameMatch = block.match(/<NAME>\s*([^\n<]+)/i);
    
    // Extract FITID (unique bank ID)
    const fitidMatch = block.match(/<FITID>\s*([^\n<]+)/i);
    
    if (dateMatch && amountMatch && fitidMatch) {
      const dateStr = dateMatch[1];
      const year = parseInt(dateStr.substring(0, 4));
      const month = parseInt(dateStr.substring(4, 6)) - 1;
      const day = parseInt(dateStr.substring(6, 8));
      
      // Parse amount - handle comma as decimal separator
      let amountStr = amountMatch[1].trim();
      amountStr = amountStr.replace(',', '.');
      const amount = parseFloat(amountStr);
      
      // Get description: prefer MEMO, fallback to NAME, combine if both exist
      let description = '';
      const memo = memoMatch?.[1]?.trim();
      const name = nameMatch?.[1]?.trim();
      
      if (memo && name && memo !== name) {
        // If both exist and are different, combine them
        description = `${name} - ${memo}`;
      } else {
        description = memo || name || 'Sem descrição';
      }
      
      const fitid = fitidMatch[1].trim();
      
      transactions.push({
        date: new Date(year, month, day),
        amount,
        description,
        fitid,
      });
    }
  }
  
  return transactions;
}
