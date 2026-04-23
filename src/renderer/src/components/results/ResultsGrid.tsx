import React from 'react'
import type { QueryResult } from '@shared/types'

interface Props {
  result?: QueryResult
  error?: string
  loading?: boolean
}

export default function ResultsGrid({ result, error, loading }: Props) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-vs-textDim text-sm gap-2">
        <span className="animate-spin inline-block w-4 h-4 border-2 border-vs-statusBar border-t-transparent rounded-full" />
        Выполняется запрос…
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 overflow-auto h-full selectable">
        <div className="bg-[#3b1919] border border-[#6e2828] rounded p-3 text-sm text-[#f48771] font-mono whitespace-pre-wrap">
          {error}
        </div>
      </div>
    )
  }

  if (!result) {
    return (
      <div className="flex items-center justify-center h-full text-vs-textDim text-sm">
        Выполните запрос чтобы увидеть результаты
      </div>
    )
  }

  const isDml = result.columns.length === 0

  return (
    <div className="flex flex-col h-full">
      {/* Status bar */}
      <div className="flex items-center gap-4 px-3 py-1 border-b border-vs-border text-xs text-vs-textDim shrink-0">
        {isDml ? (
          <span className="text-[#4ec9b0]">
            Затронуто строк: <strong className="text-[#9cdcfe]">{result.affectedRows ?? 0}</strong>
          </span>
        ) : (
          <span>
            Строк: <strong className="text-[#9cdcfe]">{result.rowCount}</strong>
            {result.rowCount === 2000 && (
              <span className="ml-1 text-[#ce9178]">(лимит 2000)</span>
            )}
          </span>
        )}
        <span>
          Время: <strong className="text-[#9cdcfe]">{result.durationMs} мс</strong>
        </span>
      </div>

      {isDml && (
        <div className="flex items-center justify-center flex-1 text-[#4ec9b0] text-sm">
          Запрос выполнен успешно
        </div>
      )}

      {!isDml && (
        <div className="flex-1 overflow-auto selectable">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-vs-panelHeader">
                <th className="w-10 px-2 py-1.5 text-right text-vs-textDim border-b border-r border-vs-border font-normal select-none">
                  #
                </th>
                {result.columns.map((col) => (
                  <th
                    key={col}
                    className="px-2 py-1.5 text-left text-[#9cdcfe] border-b border-r border-vs-border font-medium whitespace-nowrap"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, i) => (
                <tr key={i} className="hover:bg-vs-hover border-b border-vs-border">
                  <td className="px-2 py-1 text-right text-vs-textDim border-r border-vs-border select-none">
                    {i + 1}
                  </td>
                  {result.columns.map((col) => {
                    const val = row[col]
                    return (
                      <td
                        key={col}
                        className="px-2 py-1 text-vs-text border-r border-vs-border max-w-xs truncate"
                        title={val == null ? 'NULL' : String(val)}
                      >
                        {val == null
                          ? <span className="text-vs-textDim italic">NULL</span>
                          : String(val)
                        }
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
