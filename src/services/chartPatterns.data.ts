/*
 * Copyright (C) 2026 MYDCT
 */
import type { ChartPatternData } from './chartPatterns.types';

export const PATTERNS_DATA: ChartPatternData[] = [
{
    id: "headAndShoulders",
    name: "SKS (Schulter-Kopf-Schulter)",
    category: "Umkehrmuster",
    description: "Ein SKS-Muster ist eine bärische Umkehrformation, die typischerweise am Ende eines Aufwärtstrends auftritt. Es besteht aus drei Hochs, wobei das mittlere Hoch (Kopf) höher ist als die beiden seitlichen Hochs (Schultern). Eine Nackenlinie verbindet die Tiefs zwischen den Hochs.",
    characteristics: [
      "Tritt nach einem Aufwärtstrend auf.",
      "Drei Peaks: linke Schulter, Kopf (höchster Peak), rechte Schulter.",
      "Nackenlinie (Neckline) verbindet die Tiefs zwischen den Peaks.",
      "Volumen ist oft höher bei der linken Schulter und dem Kopf, geringer bei der rechten Schulter.",
    ],
    trading: "Ein Verkaufssignal entsteht, wenn der Kurs die Nackenlinie nach unten durchbricht. Das Kursziel wird oft als die Distanz vom Kopf zur Nackenlinie, projiziert nach unten vom Ausbruchspunkt, berechnet.<br><br><strong>Wahrscheinlichkeit eines guten Trades:</strong> Mittel bis hoch, insbesondere bei klarem Bruch der Nackenlinie mit erhöhtem Volumen und nachfolgender Bestätigung (z.B. Pullback zur Nackenlinie, die dann als Widerstand hält).<br><strong>Tradingeinstieg mit TP und SL:</strong> Einstieg: Short-Position bei oder nach dem Bruch der Nackenlinie. Stop-Loss (SL): Knapp über der Nackenlinie oder über der rechten Schulter. Take-Profit (TP): Mindestens die Distanz vom Kopf zur Nackenlinie, vom Ausbruchspunkt nach unten projiziert.",
    advancedConsiderations: "<strong>Fehlausbrüche:</strong> Ein Fehlausbruch über die Nackenlinie (nach oben) kann ein starkes bullisches Signal sein (siehe SKS-Top Fehlausbruch). Ein Fehlausbruch unter die Nackenlinie, der schnell wieder darüber schließt, kann ebenfalls eine Falle sein.<br><strong>Variationen:</strong> Die Nackenlinie kann leicht geneigt sein. Die Schultern müssen nicht exakt gleich hoch sein.<br><strong>Kontext:</strong> Stärkeres Signal, wenn es nach einem längeren, etablierten Aufwärtstrend auftritt. Bärische Divergenzen im RSI oder MACD können das Signal verstärken.<br><strong>Kombinationen:</strong> Kann Teil einer größeren Top-Bildung sein oder nach einem Fehlausbruch eines anderen Musters entstehen.",
    performanceStats: "Historisch gesehen eine der zuverlässigeren Umkehrformationen. Die Erfolgsquote kann je nach Markt und Zeitrahmen variieren, liegt aber oft über 60-70% bei idealtypischer Ausbildung und Bestätigung. Das Risk-Reward-Verhältnis ist oft günstig, da das Kursziel klar definiert ist."
    },
{
    id: "inverseHeadAndShoulders",
    name: "Inverse SKS (iSKS)",
    category: "Umkehrmuster",
    description: "Eine inverse SKS-Formation ist ein bullisches Umkehrmuster, das typischerweise am Ende eines Abwärtstrends auftritt. Es ist das Spiegelbild des SKS-Musters.",
    characteristics: [
      "Tritt nach einem Abwärtstrend auf.",
      "Drei Tiefs: linke Schulter, Kopf (tiefster Punkt), rechte Schulter.",
      "Nackenlinie verbindet die Hochs zwischen den Tiefs.",
      "Volumen kann beim Ausbruch über die Nackenlinie ansteigen."
    ],
    trading: "Ein Kaufsignal entsteht, wenn der Kurs die Nackenlinie nach oben durchbricht. Das Kursziel wird oft als die Distanz vom Kopf zur Nackenlinie, projiziert nach oben vom Ausbruchspunkt, berechnet.<br><br><strong>Wahrscheinlichkeit eines guten Trades:</strong> Mittel bis hoch, insbesondere bei klarem Bruch der Nackenlinie mit erhöhtem Volumen und nachfolgender Bestätigung (z.B. Pullback zur Nackenlinie, die dann als Unterstützung hält).<br><strong>Tradingeinstieg mit TP und SL:</strong> Einstieg: Long-Position bei oder nach dem Bruch der Nackenlinie. SL: Knapp unter der Nackenlinie oder unter der rechten Schulter. TP: Mindestens die Distanz vom Kopf zur Nackenlinie, vom Ausbruchspunkt nach oben projiziert.",
    advancedConsiderations: "<strong>Fehlausbrüche:</strong> Ein Fehlausbruch unter die Nackenlinie (nach unten) kann ein starkes bärisches Signal sein (siehe iSKS-Boden Fehlausbruch).<br><strong>Variationen:</strong> Die Nackenlinie kann leicht geneigt sein. Die Schultern müssen nicht exakt gleich tief sein.<br><strong>Kontext:</strong> Stärkeres Signal, wenn es nach einem längeren, etablierten Abwärtstrend auftritt. Bullische Divergenzen im RSI oder MACD können das Signal verstärken.",
    performanceStats: "Ähnlich zuverlässig wie das SKS-Top. Die Erfolgsquote ist vergleichbar, und das Risk-Reward-Verhältnis kann attraktiv sein."
    },
{
    id: "headAndShouldersTopFailure",
    name: "SKS-Top Fehlausbruch",
    category: "Umkehrmuster",
    description: "Ein SKS-Top Fehlausbruch tritt auf, wenn ein SKS-Muster sich zu bilden beginnt, der Kurs aber die Nackenlinie nicht nachhaltig nach unten durchbricht und stattdessen wieder über die rechte Schulter oder sogar den Kopf ansteigt. Dies kann ein starkes bullisches Signal sein.",
    characteristics: [
      "Ansatz eines SKS-Top-Musters (linke Schulter, Kopf, rechte Schulter).",
      "Der Kurs scheitert daran, die Nackenlinie signifikant nach unten zu durchbrechen.",
      "Stattdessen steigt der Kurs wieder an, oft über das Niveau der rechten Schulter oder des Kopfes.",
      "Signalisiert, dass die Verkäufer nicht stark genug waren, den Trend zu wenden."
    ],
    trading: "Ein Kaufsignal entsteht, wenn der Kurs nach dem gescheiterten Bruch der Nackenlinie wieder Stärke zeigt und über wichtige Widerstandsniveaus des unvollendeten SKS-Musters steigt.<br><br><strong>Wahrscheinlichkeit eines guten Trades:</strong> Mittel bis hoch, da der Fehlausbruch oft eine Falle für Short-Seller darstellt und eine starke Gegenbewegung auslösen kann.<br><strong>Tradingeinstieg mit TP und SL:</strong> Einstieg: Long-Position, wenn der Kurs über die rechte Schulter oder den Kopf des gescheiterten SKS-Musters steigt. SL: Unterhalb der Nackenlinie oder des Tiefs der rechten Schulter. TP: Basierend auf vorherigen Widerständen oder Fibonacci-Projektionen des vorherigen Aufwärtstrends.",
    advancedConsiderations: "Achten Sie auf das Volumen: Ein Fehlausbruch mit geringem Volumen beim Versuch, die Nackenlinie zu durchbrechen, und anschließendem Anstieg mit höherem Volumen ist ein stärkeres Signal.",
    performanceStats: "Fehlausbrüche können starke Signale sein, da sie Marktteilnehmer auf dem falschen Fuß erwischen. Die Zuverlässigkeit hängt von der Stärke der Umkehr ab."
  },
{
    id: "headAndShouldersBottomFailure",
    name: "iSKS-Boden Fehlausbruch",
    category: "Umkehrmuster",
    description: "Ein iSKS-Boden Fehlausbruch tritt auf, wenn ein inverses SKS-Muster sich zu bilden beginnt, der Kurs aber die Nackenlinie nicht nachhaltig nach oben durchbricht und stattdessen wieder unter die rechte Schulter oder sogar den Kopf fällt. Dies kann ein starkes bärisches Signal sein.",
    characteristics: [
      "Ansatz eines iSKS-Musters (linke Schulter, Kopf, rechte Schulter).",
      "Der Kurs scheitert daran, die Nackenlinie signifikant nach oben zu durchbrechen.",
      "Stattdessen fällt der Kurs wieder ab, oft unter das Niveau der rechten Schulter oder des Kopfes.",
      "Signalisiert, dass die Käufer nicht stark genug waren, den Trend zu wenden."
    ],
    trading: "Ein Verkaufssignal entsteht, wenn der Kurs nach dem gescheiterten Bruch der Nackenlinie wieder Schwäche zeigt und unter wichtige Unterstützungsniveaus des unvollendeten iSKS-Musters fällt.<br><br><strong>Wahrscheinlichkeit eines guten Trades:</strong> Mittel bis hoch.<br><strong>Tradingeinstieg mit TP und SL:</strong> Einstieg: Short-Position, wenn der Kurs unter die rechte Schulter oder den Kopf des gescheiterten iSKS-Musters fällt. SL: Oberhalb der Nackenlinie oder des Hochs der rechten Schulter. TP: Basierend auf vorherigen Unterstützungen oder Fibonacci-Projektionen des vorherigen Abwärtstrends.",
    advancedConsiderations: "Achten Sie auf das Volumen: Ein Fehlausbruch mit geringem Volumen beim Versuch, die Nackenlinie zu durchbrechen, und anschließendem Abfall mit höherem Volumen ist ein stärkeres Signal.",
    performanceStats: "Analog zum SKS-Top Fehlausbruch, nur in die entgegengesetzte Richtung."
  },
{
    id: "doubleTop",
    name: "Doppeltop",
    category: "Umkehrmuster",
    description: "Ein Doppeltop ist ein bärisches Umkehrmuster, das nach einem signifikanten Aufwärtstrend auftritt. Es besteht aus zwei etwa gleich hohen Hochs mit einem moderaten Tief dazwischen.",
    characteristics: [
      "Zwei aufeinanderfolgende Hochs auf ähnlichem Niveau.",
      "Ein Zwischentief (Unterstützungslinie) zwischen den Hochs.",
      "Volumen ist oft beim ersten Hoch höher als beim zweiten."
    ],
    trading: "Ein Verkaufssignal wird generiert, wenn der Kurs unter die Unterstützungslinie (das Zwischentief) fällt. Das Kursziel ist oft die Höhe des Musters (Distanz von den Hochs zur Unterstützungslinie), projiziert nach unten.<br><br><strong>Wahrscheinlichkeit eines guten Trades:</strong> Mittel bis hoch, wenn der Bruch der Unterstützungslinie mit Volumen bestätigt wird. Eine höhere Wahrscheinlichkeit besteht, wenn das zweite Hoch das erste nicht übersteigt und ggf. bärische Divergenzen bei Indikatoren auftreten.<br><strong>Tradingeinstieg mit TP und SL:</strong> Einstieg: Short-Position nach dem Bruch der Unterstützungslinie. SL: Knapp über der Unterstützungslinie (die nun Widerstand ist) oder über den Hochs. TP: Höhe des Musters vom Ausbruchspunkt nach unten projiziert.",
    advancedConsiderations: "<strong>Fehlausbrüche:</strong> Ein Fehlausbruch unter die Unterstützungslinie, der schnell wieder darüber schließt, kann eine Falle sein. Ein Ausbruch über die Hochs negiert das Muster.<br><strong>Variationen:</strong> Die Hochs müssen nicht exakt gleich sein; leichte Abweichungen sind normal. Das Zwischentief kann unterschiedlich tief sein.<br><strong>Kontext:</strong> Stärker nach einem langen Aufwärtstrend. Bärische Divergenzen (z.B. im RSI) zwischen den beiden Hochs erhöhen die Aussagekraft.<br><strong>Kombinationen:</strong> Kann Teil einer größeren Verteilungsphase sein.",
    performanceStats: "Gilt als zuverlässiges Umkehrmuster. Die Erfolgsrate kann durch Bestätigungssignale wie Volumen oder Divergenzen verbessert werden."
    },
{
    id: "doubleBottom",
    name: "Doppelboden",
    category: "Umkehrmuster",
    description: "Ein Doppelboden ist ein bullisches Umkehrmuster, das nach einem signifikanten Abwärtstrend auftritt. Es besteht aus zwei etwa gleich tiefen Tiefs mit einem moderaten Hoch dazwischen.",
    characteristics: [
      "Zwei aufeinanderfolgende Tiefs auf ähnlichem Niveau.",
      "Ein Zwischenhoch (Widerstandslinie) zwischen den Tiefs.",
      "Volumen kann beim zweiten Tief geringer sein und beim Ausbruch ansteigen."
    ],
    trading: "Ein Kaufsignal wird generiert, wenn der Kurs über die Widerstandslinie (das Zwischenhoch) steigt. Das Kursziel ist oft die Höhe des Musters (Distanz von den Tiefs zur Widerstandslinie), projiziert nach oben.<br><br><strong>Wahrscheinlichkeit eines guten Trades:</strong> Mittel bis hoch, wenn der Bruch der Widerstandslinie mit Volumen bestätigt wird. Eine höhere Wahrscheinlichkeit besteht, wenn das zweite Tief das erste nicht unterschreitet und ggf. bullische Divergenzen bei Indikatoren auftreten.<br><strong>Tradingeinstieg mit TP und SL:</strong> Einstieg: Long-Position nach dem Bruch der Widerstandslinie. SL: Knapp unter der Widerstandslinie (die nun Unterstützung ist) oder unter den Tiefs. TP: Höhe des Musters vom Ausbruchspunkt nach oben projiziert.",
    advancedConsiderations: "<strong>Fehlausbrüche:</strong> Ein Fehlausbruch über die Widerstandslinie, der schnell wieder darunter schließt, kann eine Falle sein. Ein Bruch unter die Tiefs negiert das Muster.<br><strong>Variationen:</strong> Die Tiefs müssen nicht exakt gleich sein. Das Zwischenhoch kann unterschiedlich hoch sein.<br><strong>Kontext:</strong> Stärker nach einem langen Abwärtstrend. Bullische Divergenzen (z.B. im RSI) zwischen den beiden Tiefs erhöhen die Aussagekraft.<br><strong>Kombinationen:</strong> Kann Teil einer größeren Akkumulationsphase sein.",
    performanceStats: "Gilt als zuverlässiges Umkehrmuster. Analog zum Doppeltop, Bestätigungssignale sind wichtig."
    },
{
    id: "tripleTop",
    name: "Dreifachtop (Triple Top)",
    category: "Umkehrmuster",
    description: "Ein Dreifachtop ist ein bärisches Umkehrmuster, ähnlich dem Doppeltop, aber mit drei Hochs auf etwa gleichem Niveau. Es signalisiert eine stärkere Widerstandszone.",
    characteristics: [
      "Drei aufeinanderfolgende Hochs auf ähnlichem Niveau.",
      "Zwei Zwischentiefs (Unterstützungslinie) zwischen den Hochs.",
      "Volumen nimmt oft bei jedem folgenden Hoch ab."
    ],
    trading: "Ein Verkaufssignal wird generiert, wenn der Kurs unter die Unterstützungslinie (gebildet durch die Zwischentiefs) fällt. Das Kursziel ist oft die Höhe des Musters.<br><br><strong>Wahrscheinlichkeit eines guten Trades:</strong> Hoch, da es eine stärkere Bestätigung des Widerstands darstellt als ein Doppeltop. Bestätigung durch Volumen beim Bruch ist wichtig.<br><strong>Tradingeinstieg mit TP und SL:</strong> Einstieg: Short-Position nach dem Bruch der Unterstützungslinie. SL: Knapp über der Unterstützungslinie oder über den Hochs. TP: Höhe des Musters vom Ausbruchspunkt nach unten projiziert.",
    advancedConsiderations: "<strong>Kontext:</strong> Ein Triple Top nach einem sehr starken Aufwärtstrend hat eine höhere Aussagekraft. Achten Sie auf Divergenzen bei Indikatoren über die drei Hochs hinweg.",
    performanceStats: "Stärker als ein Doppeltop, da der Widerstand dreimal bestätigt wurde. Gute Erfolgsquote bei klarem Bruch."
    },
{
    id: "tripleBottom",
    name: "Dreifachboden (Triple Bottom)",
    category: "Umkehrmuster",
    description: "Ein Dreifachboden ist ein bullisches Umkehrmuster, ähnlich dem Doppelboden, aber mit drei Tiefs auf etwa gleichem Niveau. Es signalisiert eine stärkere Unterstützungszone.",
    characteristics: [
      "Drei aufeinanderfolgende Tiefs auf ähnlichem Niveau.",
      "Zwei Zwischenhochs (Widerstandslinie) zwischen den Tiefs.",
      "Volumen kann beim dritten Tief geringer sein und beim Ausbruch ansteigen."
    ],
    trading: "Ein Kaufsignal wird generiert, wenn der Kurs über die Widerstandslinie (gebildet durch die Zwischenhochs) steigt. Das Kursziel ist oft die Höhe des Musters.<br><br><strong>Wahrscheinlichkeit eines guten Trades:</strong> Hoch, da es eine stärkere Bestätigung der Unterstützung darstellt als ein Doppelboden. Bestätigung durch Volumen beim Bruch ist wichtig.<br><strong>Tradingeinstieg mit TP und SL:</strong> Einstieg: Long-Position nach dem Bruch der Widerstandslinie. SL: Knapp unter der Widerstandslinie oder unter den Tiefs. TP: Höhe des Musters vom Ausbruchspunkt nach oben projiziert.",
    advancedConsiderations: "<strong>Kontext:</strong> Ein Triple Bottom nach einem sehr starken Abwärtstrend hat eine höhere Aussagekraft. Achten Sie auf Divergenzen bei Indikatoren über die drei Tiefs hinweg.",
    performanceStats: "Stärker als ein Doppelboden. Gute Erfolgsquote bei klarem Bruch."
    },
{
    id: "fallingWedge",
    name: "Fallender Keil (Falling Wedge)",
    category: "Umkehrmuster",
    description: "Ein fallender Keil ist typischerweise eine bullische Umkehrformation, kann aber auch als Fortsetzungsmuster in einem Aufwärtstrend auftreten. Er wird durch zwei konvergierende, abwärts geneigte Linien gebildet.",
    characteristics: [
      "Zwei abwärts geneigte Linien (Widerstand und Unterstützung), die konvergieren.",
      "Die obere Linie (Widerstand) fällt steiler als die untere Linie (Unterstützung).",
      "Volumen nimmt oft während der Bildung ab und steigt beim Ausbruch stark an."
    ],
    trading: "Ein Kaufsignal entsteht, wenn der Kurs über die obere Widerstandslinie ausbricht. Das Kursziel ist oft der breiteste Teil des Keils, projiziert vom Ausbruchspunkt.<br><br><strong>Wahrscheinlichkeit eines guten Trades:</strong> Mittel bis hoch, besonders wenn der Ausbruch mit hohem Volumen erfolgt und der Keil sich nach einem Abwärtstrend bildet (Umkehr).<br><strong>Tradingeinstieg mit TP und SL:</strong> Einstieg: Long-Position nach dem Ausbruch über die obere Keillinie. SL: Unterhalb des Ausbruchspunktes oder unter dem letzten Tief innerhalb des Keils. TP: Höhe der Basis des Keils, projiziert vom Ausbruchspunkt nach oben.",
    advancedConsiderations: "<strong>Kontext und Interpretation (Dualität):</strong> Kann als Umkehr- oder Fortsetzungsmuster fungieren.",
    performanceStats: "Fallende Keile haben eine relativ hohe Erfolgsquote als bullische Muster, insbesondere wenn sie nach einem Abwärtstrend auftreten."
  },
{
    id: "risingWedge",
    name: "Steigender Keil (Rising Wedge)",
    category: "Umkehrmuster",
    description: "Ein steigender Keil ist typischerweise eine bärische Umkehrformation, kann aber auch als Fortsetzungsmuster in einem Abwärtstrend auftreten. Er wird durch zwei konvergierende, aufwärts geneigte Linien gebildet.",
    characteristics: [
      "Zwei aufwärts geneigte Linien (Widerstand und Unterstützung), die konvergieren.",
      "Die untere Linie (Unterstützung) steigt steiler als die obere Linie (Widerstand).",
      "Volumen nimmt oft während der Bildung ab und steigt beim Ausbruch."
    ],
    trading: "Ein Verkaufssignal entsteht, wenn der Kurs unter die untere Unterstützungslinie ausbricht. Das Kursziel ist oft der breiteste Teil des Keils, projiziert vom Ausbruchspunkt.<br><br><strong>Wahrscheinlichkeit eines guten Trades:</strong> Mittel bis hoch, besonders wenn der Ausbruch mit hohem Volumen erfolgt und der Keil sich nach einem Aufwärtstrend bildet (Umkehr).<br><strong>Tradingeinstieg mit TP und SL:</strong> Einstieg: Short-Position nach dem Ausbruch unter die untere Keillinie. SL: Oberhalb des Ausbruchspunktes oder über dem letzten Hoch innerhalb des Keils. TP: Höhe der Basis des Keils, projiziert vom Ausbruchspunkt nach unten.",
    advancedConsiderations: "<strong>Kontext und Interpretation (Dualität):</strong> Kann als Umkehr- oder Fortsetzungsmuster fungieren. Bärische Divergenzen bei Oszillatoren erhöhen die Wahrscheinlichkeit.",
    performanceStats: "Steigende Keile haben eine relativ hohe Erfolgsquote als bärische Muster."
  },
{
    id: "diamondTop",
    name: "Diamant Top (Diamond Top)",
    category: "Umkehrmuster",
    description: "Ein Diamant Top ist eine seltene, aber zuverlässige bärische Umkehrformation, die nach einem Aufwärtstrend auftritt. Sie ähnelt einer Kombination aus Broadening Top und Symmetrischem Dreieck.",
    characteristics: [
      "Tritt nach einem signifikanten Aufwärtstrend auf.",
      "Beginnt mit auseinanderlaufenden Hochs und Tiefs (Broadening Phase).",
      "Gefolgt von zusammenlaufenden Hochs und Tiefs (Triangle Phase).",
      "Die vier Hauptpunkte bilden eine Diamantform."
    ],
    trading: "Ein Verkaufssignal entsteht, wenn der Kurs die untere rechte Trendlinie des Diamanten nach unten durchbricht. Das Kursziel wird oft durch Messen der größten vertikalen Distanz innerhalb des Diamanten und Projizieren nach unten vom Ausbruchspunkt bestimmt.<br><br><strong>Wahrscheinlichkeit eines guten Trades:</strong> Mittel. Diamantformationen sind seltener und können komplexer zu identifizieren sein.<br><strong>Tradingeinstieg mit TP und SL:</strong> Einstieg: Short-Position nach dem Bruch der unteren rechten Trendlinie. SL: Über dem letzten Hoch innerhalb des Diamanten. TP: Höhe des Diamanten vom Ausbruchspunkt nach unten projiziert."
  },
{
    id: "diamondBottom",
    name: "Diamant Bottom (Diamond Bottom)",
    category: "Umkehrmuster",
    description: "Ein Diamant Bottom ist eine seltene, aber zuverlässige bullische Umkehrformation, die nach einem Abwärtstrend auftritt. Sie ist das Spiegelbild des Diamant Top.",
    characteristics: [
      "Tritt nach einem signifikanten Abwärtstrend auf.",
      "Beginnt mit auseinanderlaufenden Tiefs und Hochs (Broadening Phase).",
      "Gefolgt von zusammenlaufenden Tiefs und Hochs (Triangle Phase).",
      "Die vier Hauptpunkte bilden eine Diamantform."
    ],
    trading: "Ein Kaufsignal entsteht, wenn der Kurs die obere rechte Trendlinie des Diamanten nach oben durchbricht. Das Kursziel wird oft durch Messen der größten vertikalen Distanz innerhalb des Diamanten und Projizieren nach oben vom Ausbruchspunkt bestimmt.<br><br><strong>Wahrscheinlichkeit eines guten Trades:</strong> Mittel.<br><strong>Tradingeinstieg mit TP und SL:</strong> Einstieg: Long-Position nach dem Bruch der oberen rechten Trendlinie. SL: Unter dem letzten Tief innerhalb des Diamanten. TP: Höhe des Diamanten vom Ausbruchspunkt nach oben projiziert."
  },
{
    id: "roundingTop",
    name: "Abgerundetes Top (Rounding Top)",
    category: "Umkehrmuster",
    description: "Ein abgerundetes Top ist eine bärische Umkehrformation, die einen allmählichen Übergang von einem Aufwärtstrend zu einem Abwärtstrend darstellt. Es hat eine umgekehrte U-Form.",
    characteristics: [
      "Allmähliche, abgerundete Spitze.",
      "Volumen nimmt oft während der Bildung des Tops ab und kann beim Durchbruch der Unterstützungslinie (falls vorhanden) ansteigen.",
      "Signalisiert eine nachlassende Kaufkraft und zunehmende Verkaufsbereitschaft."
    ],
    trading: "Ein Verkaufssignal kann entstehen, wenn der Kurs eine signifikante Unterstützungslinie unterhalb des Tops durchbricht oder wenn der Abwärtstrend nach der Rundung bestätigt wird.<br><br><strong>Wahrscheinlichkeit eines guten Trades:</strong> Mittel. Das Muster entwickelt sich langsam. Bestätigung des Abwärtstrends ist entscheidend.<br><strong>Tradingeinstieg mit TP und SL:</strong> Einstieg: Short-Position nach dem Bruch einer Unterstützungslinie. SL: Über dem höchsten Punkt des Tops. TP: Kann basierend auf der Höhe des Tops projiziert werden."
  },
{
    id: "roundingBottom",
    name: "Abgerundeter Boden (Rounding Bottom)",
    category: "Umkehrmuster",
    description: "Ein abgerundeter Boden (auch Saucer Bottom) ist eine bullische Umkehrformation, die einen allmählichen Übergang von einem Abwärtstrend zu einem Aufwärtstrend darstellt. Es hat eine U-Form.",
    characteristics: [
      "Allmählicher, abgerundeter Boden.",
      "Volumen nimmt oft während der Bildung des Bodens ab und steigt bei Beginn des Aufwärtstrends an.",
      "Signalisiert eine nachlassende Verkaufsbereitschaft und zunehmende Kaufkraft."
    ],
    trading: "Ein Kaufsignal kann entstehen, wenn der Kurs eine signifikante Widerstandslinie oberhalb des Bodens durchbricht oder wenn der Aufwärtstrend nach der Rundung bestätigt wird.<br><br><strong>Wahrscheinlichkeit eines guten Trades:</strong> Mittel.<br><strong>Tradingeinstieg mit TP und SL:</strong> Einstieg: Long-Position nach dem Bruch einer Widerstandslinie. SL: Unter dem tiefsten Punkt des Bodens. TP: Höhe des Bodens nach oben projiziert."
  },
{
    id: "broadeningTop",
    name: "Megafon Top (Broadening Top)",
    category: "Umkehrmuster",
    description: "Ein Broadening Top (auch Megafon Top) ist eine bärische Umkehrformation, die durch zunehmende Volatilität gekennzeichnet ist. Es besteht aus drei ansteigenden Hochs und zwei fallenden Tiefs, wobei die Trendlinien auseinanderlaufen.",
    characteristics: [
      "Zwei auseinanderlaufende Trendlinien: obere steigt, untere fällt.",
      "Mindestens drei höhere Hochs und zwei tiefere Tiefs.",
      "Signalisiert zunehmende Unsicherheit und Volatilität, oft am Ende eines Aufwärtstrends."
    ],
    trading: "Ein Verkaufssignal kann entstehen, wenn der Kurs nach dem dritten Hoch unter die untere Trendlinie fällt. Aufgrund der hohen Volatilität schwer zu handeln.<br><br><strong>Wahrscheinlichkeit eines guten Trades:</strong> Mittel.<br><strong>Tradingeinstieg mit TP und SL:</strong> Einstieg: Short-Position nach dem Bruch der unteren Trendlinie. SL: Über dem dritten Hoch. TP: Die Höhe der Formation vom Ausbruchspunkt nach unten projiziert."
  },
{
    id: "broadeningBottom",
    name: "Megafon Bottom (Broadening Bottom)",
    category: "Umkehrmuster",
    description: "Ein Broadening Bottom (auch Megafon Bottom) ist eine bullische Umkehrformation, die durch zunehmende Volatilität gekennzeichnet ist. Es besteht aus drei fallenden Tiefs und zwei steigenden Hochs.",
    characteristics: [
      "Zwei auseinanderlaufende Trendlinien: obere steigt, untere fällt.",
      "Mindestens drei tiefere Tiefs und zwei höhere Hochs.",
      "Signalisiert zunehmende Unsicherheit und Volatilität, oft am Ende eines Abwärtstrends."
    ],
    trading: "Ein Kaufsignal kann entstehen, wenn der Kurs nach dem dritten Tief über die obere Trendlinie steigt.<br><br><strong>Wahrscheinlichkeit eines guten Trades:</strong> Mittel.<br><strong>Tradingeinstieg mit TP und SL:</strong> Einstieg: Long-Position nach dem Bruch der oberen Trendlinie. SL: Unter dem dritten Tief. TP: Die Höhe der Formation vom Ausbruchspunkt nach oben projiziert."
  },
{
    id: "islandReversal",
    name: "Umkehrinsel (Island Reversal)",
    category: "Umkehrmuster",
    description: "Eine Umkehrinsel ist eine starke Umkehrformation, die durch eine Kurslücke (Gap), eine Konsolidierungsphase und eine weitere Kurslücke in die entgegengesetzte Richtung gekennzeichnet ist.",
    characteristics: [
      "Ein Gap in Trendrichtung.",
      'Eine Periode der Konsolidierung (die "Insel").',
      "Ein Gap in die entgegengesetzte Richtung, das die Insel isoliert.",
      "Signalisiert eine scharfe und oft emotionale Umkehr."
    ],
    trading: "Ein bärisches Island Reversal (Top) entsteht nach einem Aufwärtstrend, ein bullisches Island Reversal (Bottom) nach einem Abwärtstrend.<br><br><strong>Wahrscheinlichkeit eines guten Trades:</strong> Hoch, wenn beide Gaps klar definiert sind.<br><strong>Tradingeinstieg mit TP und SL:</strong> Einstieg: Nach dem zweiten Gap in die neue Richtung. SL: Auf der anderen Seite der Insel. TP: Oft signifikant."
  },
{
    id: "pipeBottom",
    name: "Pfeifenboden (Pipe Bottom)",
    category: "Umkehrmuster",
    description: "Ein Pfeifenboden ist eine bullische Umkehrformation, die durch zwei lange, parallele oder leicht konvergierende Abwärtskerzen mit tiefen Tiefs gekennzeichnet ist, gefolgt von einer starken Aufwärtsbewegung.",
    characteristics: [
      "Tritt nach einem Abwärtstrend auf.",
      "Zwei lange bärische Kerzen (Pfeifen) mit ähnlichen oder tieferen Tiefs.",
      "Signalisiert eine Kapitulation der Verkäufer, gefolgt von starkem Kaufinteresse."
    ],
    trading: "Ein Kaufsignal entsteht, wenn der Kurs nach den beiden Pfeifen deutlich ansteigt.<br><br><strong>Wahrscheinlichkeit eines guten Trades:</strong> Mittel bis hoch.<br><strong>Tradingeinstieg mit TP und SL:</strong> Einstieg: Long-Position, wenn der Kurs nach den Pfeifen eine starke bullische Kerze bildet. SL: Unter den Tiefs der Pfeifen."
  },
{
    id: "pipeTop",
    name: "Pfeifenspitze (Pipe Top)",
    category: "Umkehrmuster",
    description: "Eine Pfeifenspitze ist eine bärische Umkehrformation, das Spiegelbild des Pfeifenbodens. Sie wird durch zwei lange Aufwärtskerzen mit hohen Hochs gekennzeichnet.",
    characteristics: [
      "Tritt nach einem Aufwärtstrend auf.",
      "Zwei lange bullische Kerzen (Pfeifen) mit ähnlichen oder höheren Hochs.",
      "Signalisiert eine Erschöpfung der Käufer."
    ],
    trading: "Ein Verkaufssignal entsteht, wenn der Kurs nach den beiden Pfeifen deutlich fällt.<br><br><strong>Wahrscheinlichkeit eines guten Trades:</strong> Mittel bis hoch.<br><strong>Tradingeinstieg mit TP und SL:</strong> Einstieg: Short-Position nach Bestätigung der Umkehr. SL: Über den Hochs der Pfeifen."
  },
{
    id: "bumpAndRunReversalTop",
    name: "Bump and Run Reversal Top",
    category: "Umkehrmuster",
    description: "Eine bärische Umkehrformation. Sie beginnt mit einem moderaten Aufwärtstrend (Lead-in), gefolgt von einem steilen, exzessiven Anstieg (Bump), der die ursprüngliche Trendlinie durchbricht.",
    characteristics: [
      "Lead-in Phase: Moderater Aufwärtstrend.",
      "Bump Phase: Übermäßig steiler Anstieg.",
      "Run Phase: Nach dem Scheitern des Bumps fällt der Kurs unter die Lead-in Trendlinie."
    ],
    trading: "Verkaufssignal beim Bruch der Lead-in Trendlinie.<br><br><strong>Tradingeinstieg mit TP und SL:</strong> Einstieg: Short nach dem Bruch der Lead-in-Trendlinie. SL: Über dem Hoch des Bumps."
  },
{
    id: "bumpAndRunReversalBottom",
    name: "Bump and Run Reversal Bottom",
    category: "Umkehrmuster",
    description: "Eine bullische Umkehrformation. Sie beginnt mit einem moderaten Abwärtstrend, gefolgt von einem steilen Abfall (Bump).",
    characteristics: [
      "Lead-in Phase: Moderater Abwärtstrend.",
      "Bump Phase: Übermäßig steiler Abfall.",
      "Run Phase: Nach dem Scheitern des Bumps steigt der Kurs über die Lead-in Trendlinie."
    ],
    trading: "Kaufsignal beim Bruch der Lead-in Trendlinie nach oben.<br><br><strong>Tradingeinstieg mit TP und SL:</strong> Einstieg: Long nach dem Bruch der Lead-in-Trendlinie. SL: Unter dem Tief des Bumps."
  },
{
    id: "spikeTop",
    name: "Spike Top",
    category: "Umkehrmuster",
    description: "Ein Spike Top (V-Top) ist eine scharfe, schnelle Umkehrformation ohne signifikante Konsolidierung.",
    characteristics: [
      "Sehr schneller, fast senkrechter Anstieg.",
      "Scharfe Spitze.",
      "Sehr schneller Abfall."
    ],
    trading: "Schwer zu handeln. Bestätigung abwarten. Oft Zeichen von Übertreibung."
  },
{
    id: "spikeBottom",
    name: "Spike Bottom",
    category: "Umkehrmuster",
    description: "Ein Spike Bottom (V-Bottom) ist eine scharfe, schnelle bullische Umkehrformation.",
    characteristics: [
      "Sehr schneller, fast senkrechter Abfall.",
      "Scharfes Tief.",
      "Sehr schneller Anstieg."
    ],
    trading: "Schwer zu handeln. Bestätigung abwarten."
  },
{
    id: "threeDrivesTop",
    name: "Three Drives to a Top",
    category: "Umkehrmuster",
    description: "Eine bärische Umkehrformation mit drei symmetrischen Hochs.",
    characteristics: [
      "Drei aufeinanderfolgende Hochs (Drives).",
      "Zwei Korrekturphasen zwischen den Drives.",
      "Oft Fibonacci-Beziehungen."
    ],
    trading: "Verkaufssignal nach Vollendung des dritten Drives."
  },
{
    id: "threeDrivesBottom",
    name: "Three Drives to a Bottom",
    category: "Umkehrmuster",
    description: "Eine bullische Umkehrformation mit drei symmetrischen Tiefs.",
    characteristics: [
      "Drei aufeinanderfolgende Tiefs (Drives).",
      "Zwei Korrekturphasen.",
      "Oft Fibonacci-Beziehungen."
    ],
    trading: "Kaufsignal nach Vollendung des dritten Drives."
  },
{
    id: "hornTop",
    name: "Horn Top",
    category: "Umkehrmuster",
    description: "Eine bärische Umkehrformation mit zwei spitzen Hochs (Hörnern) und einem Zwischentief.",
    characteristics: [
      "Zwei scharfe, spitze Hochs.",
      "Zwischentief relativ flach."
    ],
    trading: "Verkaufssignal beim Bruch des Zwischentiefs."
  },
{
    id: "hornBottom",
    name: "Horn Bottom",
    category: "Umkehrmuster",
    description: "Eine bullische Umkehrformation mit zwei spitzen Tiefs (Hörnern) und einem Zwischenhoch.",
    characteristics: [
      "Zwei scharfe, spitze Tiefs.",
      "Zwischenhoch relativ flach."
    ],
    trading: "Kaufsignal beim Bruch des Zwischenhochs."
  },
{
    id: "eveAdamTop",
    name: "Eve & Adam Top",
    category: "Umkehrmuster",
    description: "Bärische Umkehr: abgerundetes Hoch (Eve) gefolgt von spitzem Hoch (Adam).",
    characteristics: [
      "Eve Top: Breites, abgerundetes Hoch.",
      "Adam Top: Enges, spitzes Hoch."
    ],
    trading: "Verkauf beim Bruch der Nackenlinie."
  },
{
    id: "eveAdamBottom",
    name: "Eve & Adam Bottom",
    category: "Umkehrmuster",
    description: "Bullische Umkehr: abgerundetes Tief (Eve) gefolgt von spitzem Tief (Adam).",
    characteristics: [
      "Eve Bottom: Breites, abgerundetes Tief.",
      "Adam Bottom: Enges, spitzes Tief."
    ],
    trading: "Kauf beim Bruch der Nackenlinie."
  },
{
    id: "invertedCupAndHandleReversal",
    name: "Invertierte Tasse mit Henkel (Umkehr)",
    category: "Umkehrmuster",
    description: "Bärische Umkehrformation, Spiegelbild der Tasse mit Henkel.",
    characteristics: [
      "Invertierte Tasse (abgerundetes Hoch).",
      "Henkel (kleinere Konsolidierung)."
    ],
    trading: "Verkaufssignal beim Ausbruch unter die Henkel-Unterstützung."
  },
{
    id: "symmetricalTriangleContinuationBullish",
    name: "Symmetr. Dreieck (Forts. Bullisch)",
    category: "Fortsetzungsmuster",
    description: "Symmetrisches Dreieck im Aufwärtstrend.",
    characteristics: ["Vorheriger Aufwärtstrend.", "Konvergierende Linien."],
    trading: "Kauf beim Ausbruch nach oben."
  },
{
    id: "symmetricalTriangleContinuationBearish",
    name: "Symmetr. Dreieck (Forts. Bärisch)",
    category: "Fortsetzungsmuster",
    description: "Symmetrisches Dreieck im Abwärtstrend.",
    characteristics: ["Vorheriger Abwärtstrend.", "Konvergierende Linien."],
    trading: "Verkauf beim Ausbruch nach unten."
  },
{
    id: "cupAndHandle",
    name: "Tasse mit Henkel",
    category: "Fortsetzungsmuster",
    description: "Bullische Fortsetzungsformation.",
    characteristics: ["Tasse (Runder Boden).", "Henkel (Konsolidierung)."],
    trading: "Kauf beim Ausbruch über den Henkel."
  },
{
    id: "invertedCupAndHandleContinuation",
    name: "Invertierte Tasse mit Henkel (Fortsetzung)",
    category: "Fortsetzungsmuster",
    description: "Bärische Fortsetzungsformation.",
    characteristics: ["Invertierte Tasse.", "Henkel."],
    trading: "Verkauf beim Ausbruch nach unten."
  },
{
    id: "bullishPennant",
    name: "Bullischer Wimpel",
    category: "Fortsetzungsmuster",
    description: "Kurzfristige Fortsetzung nach starkem Anstieg.",
    characteristics: ["Flaggenmast.", "Kleines symmetrisches Dreieck (Wimpel)."],
    trading: "Kauf beim Ausbruch."
  },
{
    id: "bearishPennant",
    name: "Bärischer Wimpel",
    category: "Fortsetzungsmuster",
    description: "Kurzfristige Fortsetzung nach starkem Abfall.",
    characteristics: ["Flaggenmast.", "Kleines symmetrisches Dreieck (Wimpel)."],
    trading: "Verkauf beim Ausbruch."
  },
{
    id: "ascendingChannel",
    name: "Aufsteigender Kanal",
    category: "Fortsetzungsmuster",
    description: "Kanal mit aufwärts gerichteten Trendlinien.",
    characteristics: ["Parallele aufwärts geneigte Linien.", "HH und HL."],
    trading: "Trades innerhalb des Kanals oder bei Ausbruch (Vorsicht)."
  },
{
    id: "descendingChannel",
    name: "Absteigender Kanal",
    category: "Fortsetzungsmuster",
    description: "Kanal mit abwärts gerichteten Trendlinien.",
    characteristics: ["Parallele abwärts geneigte Linien.", "LH und LL."],
    trading: "Trades innerhalb des Kanals oder bei Ausbruch."
  },
{
    id: "rectangleContinuationBullish",
    name: "Rechteck (Forts. Bullisch)",
    category: "Fortsetzungsmuster",
    description: "Rechteck nach Aufwärtstrend.",
    characteristics: ["Vorheriger Aufwärtstrend.", "Horizontale Begrenzungen."],
    trading: "Kauf beim Ausbruch nach oben."
  },
{
    id: "rectangleContinuationBearish",
    name: "Rechteck (Forts. Bärisch)",
    category: "Fortsetzungsmuster",
    description: "Rechteck nach Abwärtstrend.",
    characteristics: ["Vorheriger Abwärtstrend.", "Horizontale Begrenzungen."],
    trading: "Verkauf beim Ausbruch nach unten."
  },
{
    id: "deadCatBounce",
    name: "Dead Cat Bounce",
    category: "Fortsetzungsmuster",
    description: "Kurzfristige Erholung nach starkem Abverkauf, gefolgt von weiterem Abfall.",
    characteristics: [
      "Starker Kursrückgang.",
      "Kurze, schwache Erholung.",
      "Fortsetzung des Abwärtstrends."
    ],
    trading: "Kein Einstiegssignal für Long. Warnsignal."
  },
{
    id: "runawayGap",
    name: "Fortsetzungslücke (Runaway Gap)",
    category: "Gap-Typen",
    description: "Lücke inmitten eines Trends, signalisiert Beschleunigung.",
    characteristics: ["Etablierter Trend.", "Mittleres bis hohes Volumen."],
    trading: "Einstieg in Trendrichtung."
  },
{
    id: "exhaustionGap",
    name: "Erschöpfungslücke (Exhaustion Gap)",
    category: "Gap-Typen",
    description: "Lücke am Ende eines Trends, signalisiert Umkehr.",
    characteristics: ["Ende eines Trends.", "Hohes Volumen oder Blow-off."],
    trading: "Gegenbewegung abwarten."
  }
];
