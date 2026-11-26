# fixtures

`scripts/test-host.mjs` 需要三份本地 PDF（不入库，避免版权与仓库体积）：

| 文件 | 用途 |
| --- | --- |
| `paper.pdf` | 带文本层的论文（解析、去重、抽取、建图） |
| `paper-2.pdf` | 另一篇带文本层的论文（去重/多篇聚类用例） |
| `scanned.pdf` | 纯图片扫描件（`needs_ocr` 分支） |

也可以用环境变量覆盖：`LITGRAPH_TEST_PDF`、`LITGRAPH_TEST_PDF_2`、`LITGRAPH_TEST_SCAN`。
