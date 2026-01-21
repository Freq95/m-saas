/**
 * Supabase database adapter
 * Provides SQL-like interface compatible with existing code
 */

import { supabase, isSupabaseConfigured } from './supabase';
import { PostgrestError } from '@supabase/supabase-js';

export class SupabaseDb {
  async query(sql: string, params: any[] = []): Promise<{ rows: any[] }> {
    if (!isSupabaseConfigured()) {
      throw new Error('Supabase is not configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY');
    }

    const sqlUpper = sql.trim().toUpperCase();
    
    try {
      // SELECT queries
      if (sqlUpper.startsWith('SELECT')) {
        return await this.handleSelect(sql, params);
      }
      
      // INSERT queries
      if (sqlUpper.startsWith('INSERT')) {
        return await this.handleInsert(sql, params);
      }
      
      // UPDATE queries
      if (sqlUpper.startsWith('UPDATE')) {
        return await this.handleUpdate(sql, params);
      }
      
      // DELETE queries
      if (sqlUpper.startsWith('DELETE')) {
        return await this.handleDelete(sql, params);
      }
      
      // CREATE, DROP, ALTER - return empty (schema should be managed separately)
      if (sqlUpper.startsWith('CREATE') || sqlUpper.startsWith('DROP') || sqlUpper.startsWith('ALTER')) {
        return { rows: [] };
      }
      
      return { rows: [] };
    } catch (error) {
      console.error('Supabase query error:', error);
      throw error;
    }
  }

  private async handleSelect(sql: string, params: any[]): Promise<{ rows: any[] }> {
    // Parse SELECT query
    const selectMatch = sql.match(/SELECT\s+(.+?)\s+FROM\s+(\w+)/i);
    if (!selectMatch) {
      throw new Error(`Invalid SELECT query: ${sql}`);
    }

    const columns = selectMatch[1].trim();
    const table = selectMatch[2].trim();
    
    let query = supabase.from(table).select(columns === '*' ? '*' : columns);

    // Handle WHERE clause
    const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+ORDER\s+BY|\s+GROUP\s+BY|\s+LIMIT|$)/i);
    if (whereMatch) {
      const whereClause = whereMatch[1].trim();
      query = this.applyWhereClause(query, whereClause, params);
    }

    // Handle JOIN
    if (sql.includes('JOIN')) {
      // For JOIN queries, we need to use Supabase's join syntax
      // This is a simplified version - complex joins may need manual handling
      const joinMatch = sql.match(/JOIN\s+(\w+)\s+ON\s+(.+?)(?:\s+WHERE|\s+ORDER|\s+GROUP|\s+LIMIT|$)/i);
      if (joinMatch) {
        const joinTable = joinMatch[1];
        const joinCondition = joinMatch[2];
        // Supabase handles joins via select with foreign table references
        // Format: "table1(*), table2(*)"
        query = supabase.from(table).select(`${table}(*), ${joinTable}(*)`);
      }
    }

    // Handle ORDER BY
    const orderMatch = sql.match(/ORDER\s+BY\s+(\w+)(?:\s+(ASC|DESC))?/i);
    if (orderMatch) {
      const orderColumn = orderMatch[1];
      const orderDir = (orderMatch[2] || 'ASC').toLowerCase() as 'asc' | 'desc';
      query = query.order(orderColumn, { ascending: orderDir === 'asc' });
    }

    // Handle LIMIT
    const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
    if (limitMatch) {
      query = query.limit(parseInt(limitMatch[1]));
    }

    // Handle GROUP BY and aggregates
    if (sql.includes('GROUP BY') || sql.match(/\b(COUNT|SUM|AVG|MAX|MIN)\s*\(/i)) {
      // For aggregates, Supabase requires special handling
      // We'll execute and process in memory for complex cases
      const { data, error } = await query;
      if (error) throw error;
      return { rows: this.processAggregates(sql, data || []) };
    }

    const { data, error } = await query;
    if (error) throw error;
    
    return { rows: data || [] };
  }

  private async handleInsert(sql: string, params: any[]): Promise<{ rows: any[] }> {
    const insertMatch = sql.match(/INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)(?:\s+RETURNING\s+(.+))?/i);
    if (!insertMatch) {
      throw new Error(`Invalid INSERT query: ${sql}`);
    }

    const table = insertMatch[1];
    const columns = insertMatch[2].split(',').map(c => c.trim());
    const values = insertMatch[3].split(',').map(v => v.trim());
    const returning = insertMatch[4]?.trim();

    // Build object from columns and params
    const row: any = {};
    columns.forEach((col, index) => {
      const paramIndex = values[index].replace(/\$(\d+)/, '$1');
      const paramNum = parseInt(paramIndex.replace('$', ''));
      if (params[paramNum - 1] !== undefined) {
        row[col] = params[paramNum - 1];
      } else if (values[index].toUpperCase() === 'CURRENT_TIMESTAMP') {
        row[col] = new Date().toISOString();
      } else if (!values[index].startsWith('$')) {
        // Literal value
        const val = values[index].replace(/['"]/g, '');
        row[col] = isNaN(Number(val)) ? val : Number(val);
      }
    });

    const { data, error } = await supabase
      .from(table)
      .insert(row)
      .select(returning || '*');

    if (error) throw error;
    return { rows: data || [] };
  }

  private async handleUpdate(sql: string, params: any[]): Promise<{ rows: any[] }> {
    const updateMatch = sql.match(/UPDATE\s+(\w+)\s+SET\s+(.+?)(?:\s+WHERE\s+(.+))?/i);
    if (!updateMatch) {
      throw new Error(`Invalid UPDATE query: ${sql}`);
    }

    const table = updateMatch[1];
    const setClause = updateMatch[2];
    const whereClause = updateMatch[3];

    // Parse SET clause
    const updates: any = {};
    const setPairs = setClause.split(',').map(p => p.trim());
    setPairs.forEach(pair => {
      const [col, val] = pair.split('=').map(s => s.trim());
      if (val?.startsWith('$')) {
        const paramNum = parseInt(val.replace('$', ''));
        updates[col] = params[paramNum - 1];
      } else if (val?.toUpperCase() === 'CURRENT_TIMESTAMP') {
        updates[col] = new Date().toISOString();
      } else if (val) {
        const cleanVal = val.replace(/['"]/g, '');
        updates[col] = isNaN(Number(cleanVal)) ? cleanVal : Number(cleanVal);
      }
    });

    let query = supabase.from(table).update(updates);

    if (whereClause) {
      query = this.applyWhereClause(query, whereClause, params);
    }

    const { data, error } = await query.select();
    if (error) throw error;
    return { rows: data || [] };
  }

  private async handleDelete(sql: string, params: any[]): Promise<{ rows: any[] }> {
    const deleteMatch = sql.match(/DELETE\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+))?/i);
    if (!deleteMatch) {
      throw new Error(`Invalid DELETE query: ${sql}`);
    }

    const table = deleteMatch[1];
    const whereClause = deleteMatch[2];

    let query = supabase.from(table).delete();

    if (whereClause) {
      query = this.applyWhereClause(query, whereClause, params);
    }

    const { data, error } = await query.select();
    if (error) throw error;
    return { rows: data || [] };
  }

  private applyWhereClause(query: any, whereClause: string, params: any[]): any {
    // Handle simple WHERE conditions
    // This is a simplified parser - complex queries may need enhancement
    
    // Split by AND/OR but keep the operators
    const parts = whereClause.split(/\s+(AND|OR)\s+/i);
    let isAnd = true; // Default to AND
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].trim();
      
      if (part.toUpperCase() === 'AND') {
        isAnd = true;
        continue;
      } else if (part.toUpperCase() === 'OR') {
        isAnd = false;
        continue;
      }

      // Parse condition: column operator value
      // Handle various operators: =, !=, <>, >, <, >=, <=, LIKE, IN, IS NULL, etc.
      const condMatch = part.match(/(\w+)\s*(=|!=|<>|>|<|>=|<=|LIKE|ILIKE|IN|IS|IS NOT)\s*(.+)/i);
      if (condMatch) {
        const [, column, operator, value] = condMatch;
        const cleanValue = value.trim().replace(/['"]/g, '');
        const opUpper = operator.toUpperCase();
        
        // Handle parameterized queries ($1, $2, etc.)
        if (value.match(/^\$\d+$/)) {
          const paramNum = parseInt(value.replace('$', ''));
          const paramValue = params[paramNum - 1];
          
          if (opUpper === '=') {
            query = isAnd ? query.eq(column, paramValue) : query.or(`${column}.eq.${paramValue}`);
          } else if (opUpper === '!=' || opUpper === '<>') {
            query = isAnd ? query.neq(column, paramValue) : query.or(`${column}.neq.${paramValue}`);
          } else if (opUpper === '>') {
            query = isAnd ? query.gt(column, paramValue) : query.or(`${column}.gt.${paramValue}`);
          } else if (opUpper === '<') {
            query = isAnd ? query.lt(column, paramValue) : query.or(`${column}.lt.${paramValue}`);
          } else if (opUpper === '>=') {
            query = isAnd ? query.gte(column, paramValue) : query.or(`${column}.gte.${paramValue}`);
          } else if (opUpper === '<=') {
            query = isAnd ? query.lte(column, paramValue) : query.or(`${column}.lte.${paramValue}`);
          } else if (opUpper === 'IN') {
            // Handle ANY(array) for IN clauses
            const arrayValue = Array.isArray(paramValue) ? paramValue : [paramValue];
            query = isAnd ? query.in(column, arrayValue) : query.or(`${column}.in.(${arrayValue.join(',')})`);
          } else if (opUpper === 'IS' && cleanValue.toUpperCase() === 'NULL') {
            query = isAnd ? query.is(column, null) : query.or(`${column}.is.null`);
          } else if (opUpper === 'IS NOT' && cleanValue.toUpperCase() === 'NULL') {
            query = isAnd ? query.not(column, 'is', null) : query.or(`${column}.not.is.null`);
          }
        } else {
          // Literal value
          if (opUpper === '=') {
            query = isAnd ? query.eq(column, cleanValue) : query.or(`${column}.eq.${cleanValue}`);
          } else if (opUpper === '>') {
            query = isAnd ? query.gt(column, cleanValue) : query.or(`${column}.gt.${cleanValue}`);
          } else if (opUpper === '<') {
            query = isAnd ? query.lt(column, cleanValue) : query.or(`${column}.lt.${cleanValue}`);
          } else if (opUpper === '>=') {
            query = isAnd ? query.gte(column, cleanValue) : query.or(`${column}.gte.${cleanValue}`);
          } else if (opUpper === '<=') {
            query = isAnd ? query.lte(column, cleanValue) : query.or(`${column}.lte.${cleanValue}`);
          }
        }
      }
    }

    return query;
  }

  private processAggregates(sql: string, data: any[]): any[] {
    // Process GROUP BY and aggregate functions in memory
    // This is a fallback for complex queries
    if (sql.includes('COUNT(*)')) {
      return [{ count: data.length }];
    }
    return data;
  }
}

// Singleton instance
let supabaseDbInstance: SupabaseDb | null = null;

export function getSupabaseDb(): SupabaseDb {
  if (!supabaseDbInstance) {
    supabaseDbInstance = new SupabaseDb();
  }
  return supabaseDbInstance;
}

