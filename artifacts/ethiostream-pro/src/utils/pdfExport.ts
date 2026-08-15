export async function exportAnalysisPDF(pair: string, analysis: string, price: number) {
  const { jsPDF } = await import('jspdf')

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  })

  doc.setFillColor(10, 10, 10)
  doc.rect(0, 0, 210, 297, 'F')

  doc.setTextColor(212, 175, 55)
  doc.setFontSize(22)
  doc.setFont('helvetica', 'bold')
  doc.text('JJ NEXUS PRO', 15, 20)

  doc.setFontSize(13)
  doc.setTextColor(255, 255, 255)
  doc.text(`${pair} — Alchemist Analysis Report`, 15, 30)

  doc.setFontSize(9)
  doc.setTextColor(140, 140, 140)
  doc.text(`Live Price: $${price.toFixed(price > 500 ? 2 : 5)} | Generated: ${new Date().toLocaleString()} | Powered by Alchemist AI`, 15, 38)

  doc.setDrawColor(212, 175, 55)
  doc.setLineWidth(0.5)
  doc.line(15, 42, 195, 42)

  const cleanText = analysis
    .replace(/#{1,6}\s/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/─+/g, '──────────────')

  const lines = doc.splitTextToSize(cleanText, 180)
  let y = 50
  const sectionHeaders = ['MARKET STRUCTURE', 'ORDER BLOCKS', 'TRADE PLAN', 'FUNDAMENTAL', 'LIQUIDITY', 'CONFLUENCE', 'FAIR VALUE', 'INVALIDATION']

  for (const line of lines) {
    if (y > 282) {
      doc.addPage()
      doc.setFillColor(10, 10, 10)
      doc.rect(0, 0, 210, 297, 'F')
      doc.setDrawColor(212, 175, 55)
      doc.setLineWidth(0.3)
      doc.line(15, 10, 195, 10)
      y = 18
    }

    const isHeader = sectionHeaders.some(h => line.toUpperCase().includes(h))
    if (isHeader) {
      doc.setTextColor(212, 175, 55)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
    } else if (line.includes('──')) {
      doc.setTextColor(80, 70, 30)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
    } else {
      doc.setTextColor(215, 215, 215)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
    }

    doc.text(line, 15, y)
    y += isHeader ? 6 : 5
  }

  const pageCount = (doc as any).internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setTextColor(70, 65, 40)
    doc.setFontSize(7)
    doc.text(`— Alchemist AI | JJ NEXUS PRO | Not financial advice | Page ${i}/${pageCount}`, 15, 292)
  }

  doc.save(`${pair}-alchemist-analysis-${Date.now()}.pdf`)
}
