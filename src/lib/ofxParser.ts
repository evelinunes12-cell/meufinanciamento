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
  
  // Find all STMTTRN blocks (statement transactions)
  const stmttrnRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  const matches = content.matchAll(stmttrnRegex);
  
  for (const match of matches) {
    const block = match[1];
    
    // Extract DTPOSTED (date)
    const dateMatch = block.match(/<DTPOSTED>(\d{8})/i);
    // Extract TRNAMT (amount)
    const amountMatch = block.match(/<TRNAMT>([-+]?[\d.,]+)/i);
    // Extract MEMO or NAME (description)
    const memoMatch = block.match(/<MEMO>([^<\r\n]+)/i);
    const nameMatch = block.match(/<NAME>([^<\r\n]+)/i);
    // Extract FITID (unique bank ID)
    const fitidMatch = block.match(/<FITID>([^<\r\n]+)/i);
    
    if (dateMatch && amountMatch && fitidMatch) {
      const dateStr = dateMatch[1];
      const year = parseInt(dateStr.substring(0, 4));
      const month = parseInt(dateStr.substring(4, 6)) - 1;
      const day = parseInt(dateStr.substring(6, 8));
      
      // Parse amount - handle comma as decimal separator
      let amountStr = amountMatch[1].trim();
      // Replace comma with dot for parsing
      amountStr = amountStr.replace(',', '.');
      const amount = parseFloat(amountStr);
      
      const description = (memoMatch?.[1] || nameMatch?.[1] || 'Sem descrição').trim();
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
