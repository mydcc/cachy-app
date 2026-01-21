#!/usr/bin/env python3
"""
Fixes missing i18n keys in en.json and de.json
"""
import json
from pathlib import Path

BASE_DIR = Path(__file__).parent.parent

def deep_merge(base: dict, updates: dict) -> dict:
    """Recursively merge updates into base."""
    for key, value in updates.items():
        if key in base and isinstance(base[key], dict) and isinstance(value, dict):
            deep_merge(base[key], value)
        else:
            base[key] = value
    return base

def main():
    en_path = BASE_DIR / 'src' / 'locales' / 'locales' / 'en.json'
    de_path = BASE_DIR / 'src' / 'locales' / 'locales' / 'de.json'
    
    with open(en_path, 'r', encoding='utf-8') as f:
        en = json.load(f)
    with open(de_path, 'r', encoding='utf-8') as f:
        de = json.load(f)
    
    # Keys needed in BOTH EN and DE (used in code but missing in both)
    common_missing = {
        "apiErrors": {
            "noMarketData": "No market data available."
        },
        "journal": {
            "deepDive": {
                "assets": "Assets"
            }
        },
        "settings": {
            "data": {
                "title": "Data Maintenance"
            },
            "enableCmcContext": "Enable CMC Context",
            "enableGlassmorphism": "Enable Glassmorphism",
            "enableNewsAnalysis": "Enable News Analysis",
            "glassmorphismDesc": "Enable glass effect for cards and panels",
            "maxPrivateNotes": "Max Private Notes",
            "minChatProfitFactor": "Min Chat Profit Factor",
            "minChatProfitFactorDesc": "Minimum profit factor to display in chat",
            "pnlViewMode": "PnL Display Mode",
            "positionViewMode": "Position View Mode",
            "showMarketActivity": "Show Market Activity",
            "showMarketLinks": "Show Market Links",
            "showMarketSentiment": "Show Market Sentiment",
            "showSidebarActivity": "Show Sidebar Activity",
            "maintenance": {
                "backupTitle": "Backup & Restore",
                "dangerTitle": "Danger Zone",
                "healthTitle": "Data Health"
            },
            "workspace": {
                "expertDesc": "Advanced options for experienced users",
                "focusDesc": "Focus mode hides distracting elements",
                "paramsDesc": "Show detailed indicator parameters",
                "sidebarTitle": "Sidebar Configuration"
            }
        }
    }
    
    # Keys only missing in EN (exist in DE already, need EN translation)
    en_only_missing = {
        "dashboard": {
            "portfolioInputs": {
                "fetchBalanceTitle": "Fetch Balance"
            }
        },
        "journal": {
            "deepDive": {
                "charts": {
                    "descriptions": {
                        "winLoss": "Detailed distribution of trades (Long/Short, Win/Loss/BE)."
                    }
                }
            }
        },
        "settings": {
            "missingApiKeys": "Please configure your API keys in settings.",
            "indicators": {
                "historyDesc": "Maximum number of candles for calculations",
                "precisionDesc": "Number of decimal places for indicator values",
                "syncRsiDesc": "RSI automatically uses the same timeframe as the chart"
            },
            "profile": {
                "activeHotkeys": "Active Hotkeys",
                "appearanceTitle": "Appearance & Identity",
                "controlTitle": "Control & Interaction",
                "customize": "Customize",
                "hotkeysTitle": "Hotkeys"
            },
            "tabs": {
                "ai_assistant": "AI Assistant",
                "analysis": "Analysis Logic",
                "integrations": "Integrations",
                "maintenance": "Maintenance",
                "profile": "Profile & Design",
                "workspace": "Workspace & Sidebar"
            },
            "workspace": {
                "granularTechnicals": "Granular Technicals",
                "marketOverview": "Market Overview",
                "panelLayout": "Panel Layout",
                "panelMode": "Panel Mode",
                "panelTitle": "Panel Title",
                "technicalsDesc": "Show technical indicators in sidebar"
            },
            "technicals": {
                "oscillators": "Oscillators",
                "movingAverages": "Moving Averages",
                "pivots": "Pivots",
                "buy": "Buy",
                "sell": "Sell",
                "neutral": "Neutral"
            }
        }
    }
    
    # German translations for the common missing keys
    de_common = {
        "apiErrors": {
            "noMarketData": "Keine Marktdaten verfügbar."
        },
        "journal": {
            "deepDive": {
                "assets": "Assets"
            }
        },
        "settings": {
            "data": {
                "title": "Daten-Wartung"
            },
            "enableCmcContext": "CMC-Kontext aktivieren",
            "enableGlassmorphism": "Glassmorphismus aktivieren",
            "enableNewsAnalysis": "News-Analyse aktivieren",
            "glassmorphismDesc": "Glaseffekt für Karten und Panels aktivieren",
            "maxPrivateNotes": "Max. private Notizen",
            "minChatProfitFactor": "Min. Chat Profit Factor",
            "minChatProfitFactorDesc": "Mindest-Profit-Faktor für Chat-Anzeige",
            "pnlViewMode": "PnL-Anzeigemodus",
            "positionViewMode": "Positions-Ansichtsmodus",
            "showMarketActivity": "Marktaktivität anzeigen",
            "showMarketLinks": "Markt-Links anzeigen",
            "showMarketSentiment": "Marktstimmung anzeigen",
            "showSidebarActivity": "Sidebar-Aktivität anzeigen",
            "maintenance": {
                "backupTitle": "Backup & Wiederherstellung",
                "dangerTitle": "Gefahrenzone",
                "healthTitle": "Daten-Gesundheit"
            },
            "workspace": {
                "expertDesc": "Erweiterte Optionen für erfahrene Benutzer",
                "focusDesc": "Fokus-Modus blendet ablenkende Elemente aus",
                "paramsDesc": "Zeigt detaillierte Indikator-Parameter",
                "sidebarTitle": "Sidebar-Konfiguration"
            }
        }
    }
    
    # Keys only in DE that should be added to EN (sync)
    en_from_de_sync = {
        "journal": {
            "deepDive": {
                "charts": {
                    "descriptions": {
                        "dayOfWeekPnl": "Gross profits and losses per day of the week.",
                        "durationVsPnl": "Relationship between hold time and profit/loss. Do you recognize patterns in short vs. long trades?",
                        "hourlyPnl": "Gross profits (green) and gross losses (red) per time of day. Helps identify when you are profitable and when you lose money.",
                        "longShortWinRate": "Comparison of win rates between Long and Short trades.",
                        "recovery": "Progression of your drawdowns. Shows how quickly you recover from losses."
                    }
                }
            }
        },
        "settings": {
            "ai": {
                "confirmActionsDesc": "Requires confirmation before AI actions",
                "confirmClearHistory": "Confirm Clear History",
                "confirmClearHistoryDesc": "Requires confirmation before clearing chat history"
            },
            "indicators": {
                "absoluteValue": "Absolute Value",
                "defaultTimeframe": "Default Timeframe",
                "generalSetup": "General & Setup",
                "length": "Length",
                "oscillators": "Oscillators",
                "overbought": "Overbought",
                "oversold": "Oversold",
                "percentage": "Percentage",
                "pnlViewMode": "PnL Display Mode",
                "signalLine": "Signal Line",
                "source": "Source",
                "trend": "Trend & Direction",
                "trendDirection": "Trend & Direction",
                "type": "Type",
                "visualBar": "Visual Bar",
                "volatility": "Volatility",
                "volume": "Volume & Signals",
                "volumeSignals": "Volume & Signals"
            },
            "profile": {
                "presetInfo": "You are using a hotkey preset. Switch to 'Custom' to rebind individual hotkeys.",
                "switchToCustom": "Customize Hotkeys"
            },
            "workspace": {
                "advanced": "Advanced",
                "aiAssistant": "AI Assistant",
                "confluence": "Confluence",
                "floating": "Floating",
                "focusExecutedOrders": "Show Only Executed Orders",
                "focusExecutedOrdersDesc": "Shows only fully executed orders",
                "indicatorParams": "Show Indicator Parameters",
                "indicatorParamsDesc": "Shows detailed parameters for each indicator",
                "marketChat": "Market Chat",
                "marketDataRate": "Market Data Update Rate",
                "mas": "Moving Averages",
                "positionViewMode": "Position View Mode",
                "positionViewModeDesc": "How positions are displayed in the sidebar",
                "privateNotes": "Private Notes",
                "showMarketActivity": "Show Market Activity",
                "showMarketLinks": "Show Market Links",
                "showMarketSentiment": "Show Market Sentiment",
                "sidebartitle": "Sidebar Title",
                "signals": "Signals",
                "standard": "Standard (Aside)",
                "summary": "Summary",
                "technicals": "Show Technicals Panel"
            }
        }
    }
    
    # Apply updates
    print("Updating EN...")
    deep_merge(en, common_missing)
    deep_merge(en, en_only_missing)
    deep_merge(en, en_from_de_sync)
    
    print("Updating DE...")
    deep_merge(de, de_common)
    
    # Write back
    with open(en_path, 'w', encoding='utf-8') as f:
        json.dump(en, f, ensure_ascii=False, indent=2)
        f.write('\n')
    
    with open(de_path, 'w', encoding='utf-8') as f:
        json.dump(de, f, ensure_ascii=False, indent=2)
        f.write('\n')
    
    print("Done! Files updated successfully.")

if __name__ == '__main__':
    main()
