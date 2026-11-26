首个公开发布版本：把当前本地版 LitGraph 冻结开源。

**功能**
- 星图：星系（一级学科）→ 星座（二级子领域）→ 论文三层力导向布局，缩放/平移/重新布局，搜索命中高亮，聚类粒度 1/2/3 可切
- 文献详情：元数据、摘要、AI 总结、笔记、标签、1–5 星评分、期刊指标（easyScholar）、打开原文（Zotero / RetainPDF）
- 论文库：排序、分页、聚类筛选、标签/星级筛选、已读未读状态、BibTeX 导出、批量删除
- 导入：PDF 拖拽上传、扫描件 OCR（模型视觉 + Windows 本地 OCR 回退）、Zotero 库扫描与批量导入（PDF 或仅题录）
- 时间轴视图、深色/浅色/跟随系统主题、字号档位

**安装**
```
git clone https://github.com/zhengziling0128-svg/litgraph.git
cd litgraph && npm ci && npm run build && npm run install:desktop
```
宿主半区改动需完全退出并重开 DeepSeek Harness 一次；前端改动 Ctrl+R 即可。

**注意**
- 期刊指标需要自备 easyScholar 密钥（`LITGRAPH_EASYSCHOLAR_KEY` 或设置项）
- 测试用 PDF 与真实库数据不入库