/**
 * Simple JSON-based storage system
 * 
 * LIMITATIONS:
 * - No transaction support: Multiple operations cannot be atomic
 * - No concurrent write protection: Race conditions possible under high load
 * - Memory-based: Entire dataset loaded into memory (not suitable for large datasets)
 * - Limited JOIN support: Complex queries may fail
 * - No prepared statement protection: While using parameterized queries, the parser itself is vulnerable
 * 
 * RECOMMENDATION:
 * - For production use, migrate to PostgreSQL or another proper database
 * - This storage layer is suitable for development and small-scale deployments only
 * 
 * TRANSACTION SUPPORT:
 * - This storage system does NOT support transactions
 * - If you need atomic multi-step operations, you must:
 *   1. Implement manual rollback logic
 *   2. Use a proper database with transaction support
 *   3. Accept that partial failures may leave data in inconsistent state
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'data.json');

interface StorageData {
  users: any[];
  conversations: any[];
  messages: any[];
  tags: any[];
  conversation_tags: any[];
  services: any[];
  appointments: any[];
  reminders: any[];
  google_calendar_sync: any[];
  clients: any[];
  tasks: any[];
  client_files: any[];
  client_notes: any[];
  email_integrations: any[];
  // Legacy support - will be migrated to client_* tables
  contact_files?: any[];
  contact_custom_fields?: any[];
  contact_notes?: any[];
}

let data: StorageData = {
  users: [],
  conversations: [],
  messages: [],
  tags: [],
  conversation_tags: [],
  services: [],
  appointments: [],
  reminders: [],
  google_calendar_sync: [],
  clients: [],
  tasks: [],
  client_files: [],
  client_notes: [],
  email_integrations: [],
  // Legacy support
  contact_files: [],
  contact_custom_fields: [],
  contact_notes: [],
};

// Load data
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const fileData = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(fileData);
      // Migrate contact_* to client_* if needed
      const clientFiles = parsed.client_files || [];
      const clientNotes = parsed.client_notes || [];
      const contactFiles = parsed.contact_files || [];
      const contactNotes = parsed.contact_notes || [];
      
      // Merge legacy contact_* data into client_* (migrate contact_id to client_id)
      const migratedFiles = [...clientFiles];
      const migratedNotes = [...clientNotes];
      
      if (contactFiles.length > 0) {
        contactFiles.forEach((file: any) => {
          // If file has contact_id, migrate to client_id
          if (file.contact_id && !file.client_id) {
            migratedFiles.push({ ...file, client_id: file.contact_id });
          } else {
            migratedFiles.push(file);
          }
        });
      }
      
      if (contactNotes.length > 0) {
        contactNotes.forEach((note: any) => {
          if (note.contact_id && !note.client_id) {
            migratedNotes.push({ ...note, client_id: note.contact_id });
          } else {
            migratedNotes.push(note);
          }
        });
      }
      
      data = {
        users: parsed.users || [],
        conversations: parsed.conversations || [],
        messages: parsed.messages || [],
        tags: parsed.tags || [],
        conversation_tags: parsed.conversation_tags || [],
        services: parsed.services || [],
        appointments: parsed.appointments || [],
        reminders: parsed.reminders || [],
        google_calendar_sync: parsed.google_calendar_sync || [],
        clients: parsed.clients || [],
        tasks: parsed.tasks || [],
        client_files: migratedFiles,
        client_notes: migratedNotes,
        email_integrations: parsed.email_integrations || [],
        // Legacy support - keep for backward compatibility during migration
        contact_files: contactFiles,
        contact_custom_fields: parsed.contact_custom_fields || [],
        contact_notes: contactNotes,
      };
    }
  } catch (error) {
    console.error('Error loading data:', error);
  }
}

// Save data
function saveData() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving data:', error);
  }
}

// Initialize
loadData();

// Simple query handler
export class JsonDb {
  async query(sql: string, params: any[] = []): Promise<{ rows: any[] }> {
    const sqlUpper = sql.toUpperCase().trim();
    
    // SELECT queries
    if (sqlUpper.startsWith('SELECT')) {
      return this.handleSelect(sql, params);
    }
    
    // INSERT queries
    if (sqlUpper.startsWith('INSERT')) {
      return this.handleInsert(sql, params);
    }
    
    // UPDATE queries
    if (sqlUpper.startsWith('UPDATE')) {
      return this.handleUpdate(sql, params);
    }
    
    // DELETE queries
    if (sqlUpper.startsWith('DELETE')) {
      return this.handleDelete(sql, params);
    }
    
    // CREATE TABLE/INDEX - just return empty
    if (sqlUpper.startsWith('CREATE')) {
      return { rows: [] };
    }
    
    return { rows: [] };
  }

  private handleSelect(sql: string, params: any[]): { rows: any[] } {
    // Handle JOIN queries (for dashboard)
    if (sql.includes('JOIN')) {
      return this.handleJoinSelect(sql, params);
    }
    
    // Handle GROUP BY queries (for dashboard)
    if (sql.includes('GROUP BY')) {
      return this.handleGroupBySelect(sql, params);
    }
    
    // Handle aggregate queries (COUNT, SUM, etc.)
    if (sql.match(/\b(COUNT|SUM|AVG|MAX|MIN)\s*\(/i)) {
      return this.handleAggregateSelect(sql, params);
    }
    
    // Extract table name
    const fromMatch = sql.match(/FROM\s+(\w+)/i);
    if (!fromMatch) return { rows: [] };
    
    const tableName = fromMatch[1] as keyof StorageData;
    if (!data[tableName]) return { rows: [] };
    
    let result = [...data[tableName]];
    
    // Handle WHERE
    if (sql.includes('WHERE')) {
      const whereMatch = sql.match(/WHERE\s+([\s\S]+?)(?:\s+ORDER|\s+GROUP|\s+LIMIT|$)/i);
      if (whereMatch) {
        const conditions = whereMatch[1];
        result = result.filter((item: any) => {
          return this.evaluateWhereCondition(conditions, item, params);
        });
      }
    }
    
    // Handle ORDER BY
    if (sql.includes('ORDER BY')) {
      const orderMatch = sql.match(/ORDER BY\s+(\w+\.?\w*)(?:\s+(ASC|DESC))?/i);
      if (orderMatch) {
        const columnWithAlias = orderMatch[1];
        const column = columnWithAlias.includes('.') ? columnWithAlias.split('.')[1] : columnWithAlias;
        const direction = orderMatch[2]?.toUpperCase() || 'ASC';
        const normalize = (val: any) => {
          if (val === null || val === undefined) return '';
          if (typeof val === 'number') return val;
          if (val instanceof Date) return val.toISOString();
          return String(val);
        };
        result.sort((a: any, b: any) => {
          const aVal = normalize(a[column]);
          const bVal = normalize(b[column]);
          if (direction === 'DESC') {
            return bVal > aVal ? 1 : bVal < aVal ? -1 : 0;
          }
          return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
        });
      }
    }
    
    return { rows: result };
  }

  private evaluateWhereCondition(conditions: string, item: any, params: any[]): boolean {
    // Helper to strip table alias from column name (e.g., "a.user_id" -> "user_id")
    const stripAlias = (column: string): string => {
      const parts = column.split('.');
      return parts.length > 1 ? parts[1] : parts[0];
    };
    
    // Helper to evaluate a single condition (like "start_time < $2")
    const evaluateSingleCondition = (condition: string): boolean => {
      const trimmed = condition.trim();
      
      const matchesLike = (value: string, pattern: string, caseInsensitive = false): boolean => {
        const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regexPattern = `^${escaped.replace(/%/g, '.*').replace(/_/g, '.')}$`;
        const flags = caseInsensitive ? 'i' : '';
        const regex = new RegExp(regexPattern, flags);
        return regex.test(value);
      };

      // Handle column LIKE $N / ILIKE $N
      const likeParamMatch = trimmed.match(/(\w+\.?\w*)\s+(I?LIKE)\s+\$(\d+)/i);
      if (likeParamMatch) {
        const [, column, likeOp, paramIndex] = likeParamMatch;
        const columnName = stripAlias(column);
        const paramValue = params[parseInt(paramIndex) - 1];
        const value = (item[columnName] ?? '').toString();
        const pattern = (paramValue ?? '').toString();
        return matchesLike(value, pattern, likeOp.toUpperCase() === 'ILIKE');
      }

      // Handle column LIKE 'literal' / ILIKE 'literal'
      const likeLiteralMatch = trimmed.match(/(\w+\.?\w*)\s+(I?LIKE)\s+(['"])(.*?)\3/i);
      if (likeLiteralMatch) {
        const [, column, likeOp, , literalValue] = likeLiteralMatch;
        const columnName = stripAlias(column);
        const value = (item[columnName] ?? '').toString();
        return matchesLike(value, literalValue, likeOp.toUpperCase() === 'ILIKE');
      }

      // Handle LOWER(column) = LOWER($N)
      const lowerParamMatch = trimmed.match(/LOWER\((\w+)\)\s*=\s*LOWER\(\$(\d+)\)/i);
      if (lowerParamMatch) {
        const [, column, paramIndex] = lowerParamMatch;
        const paramValue = params[parseInt(paramIndex) - 1];
        const itemVal = (item[column] ?? '').toString().toLowerCase();
        const compareVal = (paramValue ?? '').toString().toLowerCase();
        return itemVal === compareVal;
      }

      // Handle LOWER(column) = $N
      const lowerDirectParamMatch = trimmed.match(/LOWER\((\w+)\)\s*=\s*\$(\d+)/i);
      if (lowerDirectParamMatch) {
        const [, column, paramIndex] = lowerDirectParamMatch;
        const paramValue = params[parseInt(paramIndex) - 1];
        const itemVal = (item[column] ?? '').toString().toLowerCase();
        const compareVal = (paramValue ?? '').toString().toLowerCase();
        return itemVal === compareVal;
      }

      // Handle column = $N (with optional table alias)
      const paramMatch = trimmed.match(/(\w+\.?\w*)\s*=\s*\$(\d+)/i);
      if (paramMatch) {
        const [, column, paramIndex] = paramMatch;
        const columnName = stripAlias(column);
        const paramValue = params[parseInt(paramIndex) - 1];
        if (paramValue !== undefined) {
          if (columnName === 'user_id' || columnName === 'conversation_id' || columnName === 'id') {
            if (item[columnName] !== parseInt(paramValue)) return false;
          } else if (columnName === 'status') {
            if (item[columnName] !== paramValue) return false;
          } else {
            if (paramValue instanceof Date) {
              const itemTime = new Date(item[columnName]).getTime();
              if (isNaN(itemTime) || itemTime !== paramValue.getTime()) return false;
            } else if (item[columnName] instanceof Date) {
              const paramTime = new Date(paramValue as any).getTime();
              if (isNaN(paramTime) || item[columnName].getTime() !== paramTime) return false;
            } else {
              if (item[columnName] !== paramValue) return false;
            }
          }
        }
        return true;
      }

      // Handle column = 'literal' or column = "literal"
      const literalMatch = trimmed.match(/(\w+\.?\w*)\s*=\s*(['"])(.*?)\2/i);
      if (literalMatch) {
        const [, column, , literalValue] = literalMatch;
        const columnName = stripAlias(column);
        return (item[columnName] ?? null) === literalValue;
      }

      // Handle column IS NULL / IS NOT NULL
      const isNullMatch = trimmed.match(/(\w+\.?\w*)\s+IS\s+NULL/i);
      if (isNullMatch) {
        const [, column] = isNullMatch;
        const columnName = stripAlias(column);
        return item[columnName] === null || item[columnName] === undefined;
      }

      const isNotNullMatch = trimmed.match(/(\w+\.?\w*)\s+IS\s+NOT\s+NULL/i);
      if (isNotNullMatch) {
        const [, column] = isNotNullMatch;
        const columnName = stripAlias(column);
        return item[columnName] !== null && item[columnName] !== undefined;
      }
      
      // Handle column >= $N (with optional table alias)
      const gteMatch = trimmed.match(/(\w+\.?\w*)\s*>=\s*\$(\d+)/i);
      if (gteMatch) {
        const [, column, paramIndex] = gteMatch;
        const columnName = stripAlias(column);
        const paramValue = params[parseInt(paramIndex) - 1];
        if (paramValue !== undefined) {
          const itemVal = new Date(item[columnName]).getTime();
          const paramVal = new Date(paramValue).getTime();
          if (isNaN(itemVal) || isNaN(paramVal) || itemVal < paramVal) return false;
        }
        return true;
      }
      
      // Handle column <= $N (with optional table alias)
      const lteMatch = trimmed.match(/(\w+\.?\w*)\s*<=\s*\$(\d+)/i);
      if (lteMatch) {
        const [, column, paramIndex] = lteMatch;
        const columnName = stripAlias(column);
        const paramValue = params[parseInt(paramIndex) - 1];
        if (paramValue !== undefined) {
          const itemVal = new Date(item[columnName]).getTime();
          const paramVal = new Date(paramValue).getTime();
          if (isNaN(itemVal) || isNaN(paramVal) || itemVal > paramVal) return false;
        }
        return true;
      }
      
      // Handle column < $N (with optional table alias)
      const ltMatch = trimmed.match(/(\w+\.?\w*)\s*<\s*\$(\d+)/i);
      if (ltMatch) {
        const [, column, paramIndex] = ltMatch;
        const columnName = stripAlias(column);
        const paramValue = params[parseInt(paramIndex) - 1];
        if (paramValue !== undefined) {
          const itemVal = new Date(item[columnName]).getTime();
          const paramVal = new Date(paramValue).getTime();
          if (isNaN(itemVal) || isNaN(paramVal) || itemVal >= paramVal) return false;
        }
        return true;
      }
      
      // Handle column > $N (with optional table alias)
      const gtMatch = trimmed.match(/(\w+\.?\w*)\s*>\s*\$(\d+)/i);
      if (gtMatch) {
        const [, column, paramIndex] = gtMatch;
        const columnName = stripAlias(column);
        const paramValue = params[parseInt(paramIndex) - 1];
        if (paramValue !== undefined) {
          const itemVal = new Date(item[columnName]).getTime();
          const paramVal = new Date(paramValue).getTime();
          if (isNaN(itemVal) || isNaN(paramVal) || itemVal <= paramVal) return false;
        }
        return true;
      }
      
      // Handle DATE(column) = CURRENT_DATE
      if (trimmed.includes('DATE(') && trimmed.includes('CURRENT_DATE')) {
        const dateMatch = trimmed.match(/DATE\((\w+)\)/i);
        if (dateMatch) {
          const column = dateMatch[1];
          const itemDate = new Date(item[column]).toISOString().split('T')[0];
          const today = new Date().toISOString().split('T')[0];
          if (itemDate !== today) return false;
        }
        return true;
      }
      
      // Handle column IN (...)
      const inMatch = trimmed.match(/(\w+)\s+IN\s*\((.+?)\)/i);
      if (inMatch) {
        const [, column, values] = inMatch;
        const valueList = values.split(',').map(v => v.trim().replace(/'/g, ''));
        if (!valueList.includes(item[column])) return false;
        return true;
      }
      
      return false; // If no match, fail-safe: condition does not pass
    };
    
    // Handle OR conditions: split by OR first, then by AND
    if (conditions.includes(' OR ')) {
      // Split by OR and evaluate each OR branch
      const orParts = conditions.split(/\s+OR\s+/i);
      for (const orPart of orParts) {
        const trimmed = orPart.trim();
        // Remove outer parentheses if present (handle multiple levels)
        let cleaned = trimmed;
        while (cleaned.startsWith('(') && cleaned.endsWith(')')) {
          cleaned = cleaned.slice(1, -1).trim();
        }
        
        // Split by AND and evaluate all conditions
        const andParts = cleaned.split(/\s+AND\s+/i);
        let allPassed = true;
        for (const andPart of andParts) {
          let cleanedAnd = andPart.trim();
          // Remove inner parentheses if present (handle multiple levels)
          while (cleanedAnd.startsWith('(') && cleanedAnd.endsWith(')')) {
            cleanedAnd = cleanedAnd.slice(1, -1).trim();
          }
          
          if (!evaluateSingleCondition(cleanedAnd)) {
            allPassed = false;
            break;
          }
        }
        // If any OR branch passes, return true
        if (allPassed) return true;
      }
      return false; // All OR branches failed
    }
    
    // No OR at top level, but check for OR in AND parts
    const andParts = conditions.split(/\s+AND\s+/i);
    for (const part of andParts) {
      const trimmed = part.trim();
      // Remove outer parentheses if present (handle multiple levels)
      let cleaned = trimmed;
      while (cleaned.startsWith('(') && cleaned.endsWith(')')) {
        cleaned = cleaned.slice(1, -1).trim();
      }
      
      // Check if this AND part contains OR conditions (nested OR)
      if (cleaned.includes(' OR ')) {
        // Recursively evaluate the OR condition
        if (!this.evaluateWhereCondition(cleaned, item, params)) {
          return false;
        }
      } else {
        // It's a simple condition
        if (!evaluateSingleCondition(cleaned)) {
          return false;
        }
      }
    }
    
    return true;
  }

  private handleJoinSelect(sql: string, params: any[]): { rows: any[] } {
    // Extract table and JOIN info
    const fromMatch = sql.match(/FROM\s+(\w+)\s+(\w+)?/i);
    if (!fromMatch) return { rows: [] };
    
    const mainTable = fromMatch[1] as keyof StorageData;
    const mainAlias = fromMatch[2] || mainTable;
    if (!data[mainTable]) return { rows: [] };
    
    let mainData = [...data[mainTable]];
    
    // Handle LEFT JOIN or JOIN
    let joinedData: any[] = [];
    const leftJoinMatch = sql.match(/LEFT\s+JOIN\s+(\w+)\s+(\w+)\s+ON\s+(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)/i);
    const innerJoinMatch = sql.match(/JOIN\s+(\w+)\s+(\w+)\s+ON\s+(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)/i);
    const joinMatch = leftJoinMatch || innerJoinMatch;
    
    if (joinMatch) {
      const [, joinTable, joinAlias, leftTable, leftCol, rightTable, rightCol] = joinMatch;
      const joinTableData = data[joinTable as keyof StorageData] || [];
      const isLeftJoin = !!leftJoinMatch;
      
      // Perform join
      joinedData = mainData.map((mainItem: any) => {
        const joinItem = joinTableData.find((j: any) => {
          // Check if left table is main table or its alias
          if (leftTable === mainTable || leftTable === mainAlias) {
            return mainItem[leftCol] === j[rightCol];
          } else if (rightTable === mainTable || rightTable === mainAlias) {
            return j[leftCol] === mainItem[rightCol];
          }
          return false;
        });
        
        // For LEFT JOIN, include main item even if no match found
        if (isLeftJoin || joinItem) {
          // Map selected columns
          const result: any = { ...mainItem };
          if (joinItem) {
            // Add joined table columns with alias prefix if needed
            Object.keys(joinItem).forEach(key => {
              if (key !== leftCol && key !== rightCol) {
                result[key] = joinItem[key];
              }
            });
          }
          return result;
        }
        return null;
      }).filter((item: any) => item !== null);
      
      // Apply WHERE conditions
      if (sql.includes('WHERE')) {
        const whereMatch = sql.match(/WHERE\s+([\s\S]+?)(?:\s+ORDER|\s+GROUP|$)/i);
        if (whereMatch) {
          joinedData = joinedData.filter((item: any) => {
            return this.evaluateWhereCondition(whereMatch[1], item, params);
          });
        }
      }
    } else {
      // No JOIN, just apply WHERE
      joinedData = mainData.filter((item: any) => {
        if (sql.includes('WHERE')) {
          const whereMatch = sql.match(/WHERE\s+([\s\S]+?)(?:\s+ORDER|\s+GROUP|$)/i);
          if (whereMatch) {
            return this.evaluateWhereCondition(whereMatch[1], item, params);
          }
        }
        return true;
      });
    }
    
    // Handle ORDER BY
    if (sql.includes('ORDER BY')) {
      const orderMatch = sql.match(/ORDER BY\s+(\w+\.?\w*)(?:\s+(ASC|DESC))?/i);
      if (orderMatch) {
        const columnWithAlias = orderMatch[1];
        const column = columnWithAlias.includes('.') ? columnWithAlias.split('.')[1] : columnWithAlias;
        const direction = orderMatch[2]?.toUpperCase() || 'ASC';
        const normalize = (val: any) => {
          if (val === null || val === undefined) return '';
          if (typeof val === 'number') return val;
          if (val instanceof Date) return val.toISOString();
          return String(val);
        };
        joinedData.sort((a: any, b: any) => {
          const aVal = normalize(a[column]);
          const bVal = normalize(b[column]);
          if (direction === 'DESC') {
            return bVal > aVal ? 1 : bVal < aVal ? -1 : 0;
          }
          return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
        });
      }
    }
    
    return { rows: joinedData };
  }

  private handleGroupBySelect(sql: string, params: any[]): { rows: any[] } {
    // Extract table and JOIN info
    const fromMatch = sql.match(/FROM\s+(\w+)/i);
    if (!fromMatch) return { rows: [] };
    
    const mainTable = fromMatch[1] as keyof StorageData;
    if (!data[mainTable]) return { rows: [] };
    
    let mainData = [...data[mainTable]];
    
    // Handle JOIN
    let joinedData: any[] = [];
    const joinMatch = sql.match(/JOIN\s+(\w+)\s+(\w+)\s+ON\s+(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)/i);
    if (joinMatch) {
      const [, joinTable, joinAlias, leftTable, leftCol, rightTable, rightCol] = joinMatch;
      const joinTableData = data[joinTable as keyof StorageData] || [];
      
      // Perform join
      joinedData = mainData.map((mainItem: any) => {
        const joinItem = joinTableData.find((j: any) => {
          if (leftTable === mainTable || leftTable === joinAlias) {
            return mainItem[leftCol] === j[rightCol];
          } else {
            return j[leftCol] === mainItem[rightCol];
          }
        });
        return { ...mainItem, ...joinItem };
      }).filter((item: any) => {
        // Apply WHERE conditions
        if (sql.includes('WHERE')) {
          const whereMatch = sql.match(/WHERE\s+([\s\S]+?)(?:\s+GROUP|\s+ORDER|$)/i);
          if (whereMatch) {
            return this.evaluateWhereCondition(whereMatch[1], item, params);
          }
        }
        return true;
      });
    } else {
      joinedData = mainData.filter((item: any) => {
        if (sql.includes('WHERE')) {
          const whereMatch = sql.match(/WHERE\s+([\s\S]+?)(?:\s+GROUP|\s+ORDER|$)/i);
          if (whereMatch) {
            return this.evaluateWhereCondition(whereMatch[1], item, params);
          }
        }
        return true;
      });
    }
    
    // Handle GROUP BY
    const groupByMatch = sql.match(/GROUP BY\s+(.+?)(?:\s+ORDER|$)/i);
    if (groupByMatch) {
      const groupByExpr = groupByMatch[1].trim();
      
      // Handle DATE(column)
      const dateMatch = groupByExpr.match(/DATE\((\w+)\)/i);
      if (dateMatch) {
        const column = dateMatch[1];
        const grouped: { [key: string]: any[] } = {};
        
        joinedData.forEach((item: any) => {
          const date = new Date(item[column]).toISOString().split('T')[0];
          if (!grouped[date]) grouped[date] = [];
          grouped[date].push(item);
        });
        
        // Handle SELECT with COUNT
        const countMatch = sql.match(/SELECT\s+DATE\((\w+)\)\s+as\s+date,\s*COUNT\(\*\)\s+as\s+count/i);
        if (countMatch) {
          return {
            rows: Object.entries(grouped).map(([date, items]) => ({
              date,
              count: items.length.toString()
            }))
          };
        }
      }
    }
    
    return { rows: [] };
  }

  private handleAggregateSelect(sql: string, params: any[]): { rows: any[] } {
    // Handle COUNT(*)
    const countMatch = sql.match(/SELECT\s+COUNT\(\*\)\s+as\s+count/i);
    if (countMatch) {
      const fromMatch = sql.match(/FROM\s+(\w+)/i);
      if (!fromMatch) return { rows: [{ count: '0' }] };
      
      const tableName = fromMatch[1] as keyof StorageData;
      if (!data[tableName]) return { rows: [{ count: '0' }] };
      
      let result = [...data[tableName]];
      
      // Handle WHERE
      if (sql.includes('WHERE')) {
        const whereMatch = sql.match(/WHERE\s+([\s\S]+?)(?:\s+GROUP|\s+ORDER|$)/i);
        if (whereMatch) {
          result = result.filter((item: any) => {
            return this.evaluateWhereCondition(whereMatch[1], item, params);
          });
        }
      }
      
      // Handle JOIN
      if (sql.includes('JOIN')) {
        const joinMatch = sql.match(/JOIN\s+(\w+)\s+(\w+)\s+ON\s+(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)/i);
        if (joinMatch) {
          const [, joinTable, joinAlias, leftTable, leftCol, rightTable, rightCol] = joinMatch;
          const joinTableData = data[joinTable as keyof StorageData] || [];
          
          result = result.filter((mainItem: any) => {
            return joinTableData.some((j: any) => {
              if (leftTable === tableName || leftTable === joinAlias) {
                return mainItem[leftCol] === j[rightCol];
              } else {
                return j[leftCol] === mainItem[rightCol];
              }
            });
          });
        }
      }
      
      return { rows: [{ count: result.length.toString() }] };
    }
    
    // Handle SUM
    const sumMatch = sql.match(/SELECT\s+COALESCE\(SUM\((\w+)\.(\w+)\),\s*0\)\s+as\s+(\w+)/i);
    if (sumMatch) {
      const [, tableAlias, column, alias] = sumMatch;
      const fromMatch = sql.match(/FROM\s+(\w+)/i);
      if (!fromMatch) return { rows: [{ [alias]: '0' }] };
      
      const tableName = fromMatch[1] as keyof StorageData;
      if (!data[tableName]) return { rows: [{ [alias]: '0' }] };
      
      let result = [...data[tableName]];
      
      // Handle WHERE
      if (sql.includes('WHERE')) {
        const whereMatch = sql.match(/WHERE\s+([\s\S]+?)(?:\s+GROUP|\s+ORDER|$)/i);
        if (whereMatch) {
          result = result.filter((item: any) => {
            return this.evaluateWhereCondition(whereMatch[1], item, params);
          });
        }
      }
      
      // Handle JOIN
      let joinMatch: RegExpMatchArray | null = null;
      if (sql.includes('JOIN')) {
        joinMatch = sql.match(/JOIN\s+(\w+)\s+(\w+)\s+ON\s+(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)/i);
        if (joinMatch) {
          const [, joinTable, joinAlias, leftTable, leftCol, rightTable, rightCol] = joinMatch;
          const joinTableData = data[joinTable as keyof StorageData] || [];
          
          result = result.map((mainItem: any) => {
            const joinItem = joinTableData.find((j: any) => {
              if (leftTable === tableName || leftTable === joinAlias) {
                return mainItem[leftCol] === j[rightCol];
              } else {
                return j[leftCol] === mainItem[rightCol];
              }
            });
            return { ...mainItem, ...joinItem };
          }).filter((item: any) => {
            // Apply WHERE conditions on joined data
            if (sql.includes('WHERE')) {
              const whereMatch = sql.match(/WHERE\s+([\s\S]+?)(?:\s+GROUP|\s+ORDER|$)/i);
              if (whereMatch) {
                return this.evaluateWhereCondition(whereMatch[1], item, params);
              }
            }
            return true;
          });
        }
      }
      
      // Calculate SUM
      const actualColumn = joinMatch ? (joinMatch[2] === tableAlias ? column : column) : column;
      const sum = result.reduce((acc: number, item: any) => {
        const value = parseFloat(item[actualColumn] || item[column] || '0');
        return acc + (isNaN(value) ? 0 : value);
      }, 0);
      
      return { rows: [{ [alias]: sum.toString() }] };
    }
    
    // Handle COUNT FILTER
    const filterMatch = sql.match(/COUNT\(\*\)\s+FILTER\s+\(WHERE\s+(.+?)\)/i);
    if (filterMatch) {
      const condition = filterMatch[1];
      const fromMatch = sql.match(/FROM\s+(\w+)/i);
      if (!fromMatch) return { rows: [{ no_shows: '0', total: '0' }] };
      
      const tableName = fromMatch[1] as keyof StorageData;
      if (!data[tableName]) return { rows: [{ no_shows: '0', total: '0' }] };
      
      let result = [...data[tableName]];
      
      // Handle WHERE
      if (sql.includes('WHERE')) {
        const whereMatch = sql.match(/WHERE\s+([\s\S]+?)(?:\s+GROUP|\s+ORDER|$)/i);
        if (whereMatch) {
          result = result.filter((item: any) => {
            return this.evaluateWhereCondition(whereMatch[1], item, params);
          });
        }
      }
      
      const total = result.length;
      const filtered = result.filter((item: any) => {
        return this.evaluateWhereCondition(condition, item, params);
      }).length;
      
      return { rows: [{ no_shows: filtered.toString(), total: total.toString() }] };
    }
    
    return { rows: [] };
  }

  private handleInsert(sql: string, params: any[]): { rows: any[] } {
    // Normalize SQL - remove extra whitespace and newlines for easier parsing
    const normalizedSql = sql.replace(/\s+/g, ' ').trim();
    
    // Match INSERT INTO table (columns) VALUES (values) [RETURNING ...]
    // Use a more robust regex that handles nested parentheses
    const insertMatch = normalizedSql.match(/INSERT\s+INTO\s+(\w+)\s*\((.+?)\)\s*VALUES\s*\((.+?)\)(?:\s+RETURNING.*)?/i);
    if (!insertMatch) {
      console.error('INSERT query did not match pattern:', sql);
      return { rows: [] };
    }
    
    const [, tableName, columns, values] = insertMatch;
    const tableKey = tableName as keyof StorageData;
    
    // Ensure table exists in data
    if (!data[tableKey]) {
      data[tableKey] = [] as any;
    }
    
    const columnList = columns.split(',').map(c => c.trim());
    // Split values more carefully to handle string literals with commas
    const valuePlaceholders: string[] = [];
    let currentValue = '';
    let inQuotes = false;
    let quoteChar = '';
    
    for (let i = 0; i < values.length; i++) {
      const char = values[i];
      if ((char === '"' || char === "'") && (i === 0 || values[i - 1] !== '\\')) {
        if (!inQuotes) {
          inQuotes = true;
          quoteChar = char;
        } else if (char === quoteChar) {
          inQuotes = false;
          quoteChar = '';
        }
        currentValue += char;
      } else if (char === ',' && !inQuotes) {
        valuePlaceholders.push(currentValue.trim());
        currentValue = '';
      } else {
        currentValue += char;
      }
    }
    if (currentValue.trim()) {
      valuePlaceholders.push(currentValue.trim());
    }
    
    // Check if we have the right number of placeholders
    if (columnList.length !== valuePlaceholders.length) {
      console.error(`Column count (${columnList.length}) doesn't match value count (${valuePlaceholders.length})`);
      console.error('SQL:', sql);
      console.error('Columns:', columnList);
      console.error('Values:', valuePlaceholders);
      return { rows: [] };
    }
    
    const newItem: any = { 
      id: this.getNextId(tableKey) 
    };
    
    columnList.forEach((col, index) => {
      const placeholder = valuePlaceholders[index];
      if (placeholder.startsWith('$')) {
        const paramIndex = parseInt(placeholder.replace('$', '')) - 1;
        const value = params[paramIndex];
        // Handle NULL
        if (value === null || value === undefined) {
          newItem[col] = null;
        } else {
          newItem[col] = value;
        }
      } else if (placeholder === 'CURRENT_TIMESTAMP') {
        newItem[col] = new Date().toISOString();
      } else if (placeholder === 'NULL' || placeholder === 'null') {
        newItem[col] = null;
      } else if (placeholder === 'FALSE' || placeholder === 'false') {
        newItem[col] = false;
      } else if (placeholder === 'TRUE' || placeholder === 'true') {
        newItem[col] = true;
      } else if (placeholder.match(/^['"](.+)['"]$/)) {
        // Handle string literals like 'lead', "value", etc.
        newItem[col] = placeholder.slice(1, -1);
      } else if (!isNaN(Number(placeholder))) {
        // Handle numeric literals
        newItem[col] = Number(placeholder);
      } else {
        newItem[col] = placeholder.replace(/^['"]|['"]$/g, '');
      }
    });
    
    (data[tableKey] as any[]).push(newItem);
    saveData();
    
    // Handle RETURNING - always return the new item if RETURNING is present
    if (normalizedSql.includes('RETURNING')) {
      return { rows: [newItem] };
    }
    
    return { rows: [] };
  }

  private handleUpdate(sql: string, params: any[]): { rows: any[] } {
    // Normalize SQL - remove extra whitespace and newlines for easier parsing
    const normalizedSql = sql.replace(/\s+/g, ' ').trim();
    
    const updateMatch = normalizedSql.match(/UPDATE\s+(\w+)\s+SET\s+(.+?)(?:\s+WHERE|$)/i);
    if (!updateMatch) {
      console.error('UPDATE query did not match pattern:', sql);
      return { rows: [] };
    }
    
    const [, tableName, setClause] = updateMatch;
    const tableKey = tableName as keyof StorageData;
    
    if (!data[tableKey]) {
      return { rows: [] };
    }
    
    let tableData = [...(data[tableKey] as any[])];
    
    // Handle WHERE clause
    const whereMatch = normalizedSql.match(/WHERE\s+([\s\S]+?)(?:\s+RETURNING|$)/i);
    let matchingItems: any[] = [];
    
    if (whereMatch) {
      const conditions = whereMatch[1];
      matchingItems = tableData.filter((item: any) => {
        return this.evaluateWhereCondition(conditions, item, params);
      });
    } else {
      matchingItems = tableData;
    }
    
    if (matchingItems.length === 0) {
      console.warn('UPDATE: No matching items found', { conditions: whereMatch?.[1], params });
      return { rows: [] };
    }
    
    // Parse SET clause - handle multiline and commas properly
    // Split by comma, but be careful with nested structures
    const setParts: string[] = [];
    let currentPart = '';
    let depth = 0;
    
    for (let i = 0; i < setClause.length; i++) {
      const char = setClause[i];
      if (char === '(') depth++;
      else if (char === ')') depth--;
      else if (char === ',' && depth === 0) {
        if (currentPart.trim()) {
          setParts.push(currentPart.trim());
        }
        currentPart = '';
        continue;
      }
      currentPart += char;
    }
    if (currentPart.trim()) {
      setParts.push(currentPart.trim());
    }
    
    // Update matching items
    matchingItems.forEach((item: any) => {
      setParts.forEach((setPart: string) => {
        const equalMatch = setPart.match(/(\w+)\s*=\s*(.+)/);
        if (equalMatch) {
          const [, column, valueExpr] = equalMatch;
          const trimmedValue = valueExpr.trim();
          
          if (trimmedValue.startsWith('$')) {
            const paramIndex = parseInt(trimmedValue.replace('$', '')) - 1;
            if (paramIndex >= 0 && paramIndex < params.length) {
              const value = params[paramIndex];
              if (value === null || value === undefined) {
                item[column] = null;
              } else {
                item[column] = value;
              }
            }
          } else if (trimmedValue === 'CURRENT_TIMESTAMP') {
            item[column] = new Date().toISOString();
          } else if (trimmedValue === 'true' || trimmedValue === 'TRUE') {
            item[column] = true;
          } else if (trimmedValue === 'false' || trimmedValue === 'FALSE') {
            item[column] = false;
          } else if (trimmedValue === 'NULL' || trimmedValue === 'null') {
            item[column] = null;
          } else if (!isNaN(Number(trimmedValue))) {
            item[column] = Number(trimmedValue);
          } else if (trimmedValue.match(/^['"](.+)['"]$/)) {
            // String literal
            item[column] = trimmedValue.slice(1, -1);
          }
        }
      });
      
      // Update the item in the original array
      const index = tableData.findIndex((t: any) => t.id === item.id);
      if (index >= 0) {
        tableData[index] = item;
      }
    });
    
    // Save updated data
    data[tableKey] = tableData as any;
    saveData();
    
    if (normalizedSql.includes('RETURNING')) {
      return { rows: matchingItems };
    }
    
    return { rows: [] };
  }

  private handleDelete(sql: string, params: any[]): { rows: any[] } {
    const deleteMatch = sql.match(/DELETE FROM\s+(\w+)(?:\s+WHERE|$)/i);
    if (!deleteMatch) return { rows: [] };
    
    const tableName = deleteMatch[1] as keyof StorageData;
    let tableData = data[tableName] as any[];
    
    const whereMatch = sql.match(/WHERE\s+([\s\S]+)/i);
    if (whereMatch) {
      const conditions = whereMatch[1];
      const idMatch = conditions.match(/id\s*=\s*\$(\d+)/i);
      if (idMatch) {
        const paramIndex = parseInt(idMatch[1]) - 1;
        const idToDelete = parseInt(params[paramIndex]);
        tableData = tableData.filter((item: any) => item.id !== idToDelete);
      }
    } else {
      tableData = [];
    }
    
    data[tableName] = tableData as any;
    saveData();
    
    return { rows: [] };
  }

  private getNextId(table: keyof StorageData): number {
    const tableData = data[table] as any[];
    if (tableData.length === 0) return 1;
    return Math.max(...tableData.map((item: any) => item.id || 0)) + 1;
  }
}

let dbInstance: JsonDb | null = null;

export function getDb(): JsonDb {
  if (!dbInstance) {
    dbInstance = new JsonDb();
  }
  return dbInstance;
}

export { loadData, saveData };

