# 山河行旅图

一个可复用的山河叙事地图模板。当前示例把苏轼、李白的生平节点、代表作品和诗句落到真实中国地图上。

## 运行

```bash
python3 -m http.server 5173
```

打开 `http://localhost:5173`。

也可以使用 npm 脚本：

```bash
npm run preview
```

## Vercel 部署

预览部署：

```bash
npm install
npm run deploy:preview
```

生产部署：

```bash
npm run deploy:prod
```

`vercel.json` 为静态资源设置了缓存策略；`.vercelignore` 会排除本地工作流文件和依赖目录。

## 数据结构

人物索引在 `data/people/index.json`，首页启动时只加载索引和默认人物。点击人物切换后，前端会按 `path` 懒加载对应的 journey JSON。

叙事数据在 `data/sushi-journey.json` 和 `data/libai-journey.json`：

- `id`：人物数据集 ID
- `heading`：地图标题
- `types`：当前人物的分类标签与颜色
- `name`：地点名
- `short`：竖牌短名
- `years`：时间段
- `type`：分类，对应当前人物 `types` 中的键
- `lnglat`：真实经纬度
- `summary`：地点事件说明
- `quote`：代表诗句
- `works`：相关作品
- `poem`：全文诗词库中的作品标题
- `importance`：全国视角显示优先级
- `bounds`：可选，人物首页视野；缺省时前端会根据 `points` 自动计算

诗词全文集中在 `data/poems.json`。新增人物时，增加一份 journey JSON，并把人物元信息与文件路径写入 `data/people/index.json` 即可。

## 图层结构

- MapLibre GL JS 负责地图渲染和交互
- `tiles/relief/{z}/{x}/{y}.webp` 是用公开 Terrarium DEM 瓦片烘焙的 relief raster tiles
- `geo/100000_full.json` 和 `geo/china-outline.json` 提供真实中国边界
- `geo/ne_50m_rivers_cn.json`、`geo/ne_50m_lakes_cn.json` 提供水系
- DOM Marker 负责竖牌地点标注
- GeoJSON LineString 负责生平路线和当前进度路线

## 烘焙 relief 瓦片

```bash
npm run bake:relief
```

脚本会下载 AWS Open Data 的 Terrarium DEM 瓦片到 `.cache/terrarium/`，输出 `tiles/relief/{z}/{x}/{y}.webp`。当前采用混合瓦片策略：

- 全球低 zoom：`z0-z3`
- 中国细节：`z4-z6`

MapLibre 会按当前视野懒加载可见瓦片。全球层在高 zoom 会 overzoom 低级瓦片，中国范围则叠加更细的局部 relief。

数据来源：

- AWS Open Data Terrain Tiles: https://registry.opendata.aws/terrain-tiles/
- Natural Earth land polygons: https://www.naturalearthdata.com/
- Mapzen Terrarium format: https://www.mapzen.com/blog/terrain-tile-service/
