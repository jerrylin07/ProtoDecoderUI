# Proto Decoding Notes

## 这份笔记的目的

这份笔记用来记录 `ProtoParser` 当前这套导出思路背后的业务逻辑，以及 `.proto` 文件里常见术语的准确叫法，方便以后回顾。

## 业务目标

我的目标不是只保留“每个 method 的样本”，而是尽量保留完整的 MITM 观测记录，便于之后倒查、复盘和重新解析。

这和主支里的 `SampleSaver` 目标不一样：

- `SampleSaver` 更像“按 method 留样本”
- 我这里需要的是“按每一次 RPC 事件完整归档”

### 为什么 `SampleSaver` 不适合这个需求

`SampleSaver` 的核心模型是：

- 按 `methodId` 分组
- 每个 `methodId` 只保留有限条样本
- 超过上限时删除最老的一条

默认配置里，`max_samples_per_method` 还是 `1`。这意味着同一个 proto method 最终只会留下最后一条样本，不适合做完整 MITM 倒查。

即使把 `max_samples_per_method` 调大，它仍然是“每个 method 保留有限样本”的模型，不是完整流量归档。

## 我这里的三层输出语义

我的业务理解更接近下面这三层：

1. `raw`
2. 数字版
3. 可读版

也就是：

`raw` -> 先得到保留数字值的版本 -> 再得到可读版本

### `raw`

`raw` 是原始证据，应该尽量原样保留。

用途：

- 以后可以重新跑解析
- 当 proto 提取错误时，仍然有最底层的回溯依据
- 当 message 类型名写错时，仍然可以重新按修正后的类型再解一遍

### `unparser`

按当前代码命名，`unparser` 其实不是“完全不解析”，而是：

- 已经按 proto schema 解出了字段结构
- 但 enum 尽量保留数字值

所以它更准确地说是：

- “数字 enum 版”
- “较少语义映射的版本”

它适合解决的问题是：

- proto 文件是手工提取和分析的，可能有错误
- 某个 enum 类型名只是临时占位或临时重定向
- 现在先保留数字值，等之后类型修正了再重新解释

### `parser`

`parser` 是更适合人读的版本：

- 已经按 proto schema 解出字段结构
- enum 会进一步映射成可读名字

它适合：

- 日常看内容
- 快速理解当前抓到的 RPC 数据

## 一个重要澄清

这里不是“不信 proto”，而是：

- 不想过早把一个可能写错的 schema 解释结果固化下来
- 尤其不想把“本来只是数字值”的 enum，过早替换成某个以后可能被修正的名字

所以保留数字值的重点是：

- 先保留可回溯的中间态
- 等类名、类型名或映射关系修正后，可以重新解释

## 关于 `EggDistributionProto` 这个例子

示例：

```proto
message EggDistributionProto {
    message EggDistributionEntryProto {
        HoloPokemonClass rarity = 1;
        HoloPokemonId pokemon_id = 2;
        PokemonDisplayProto pokemon_display = 3;
        float shiny_rate = 4;
    }

    repeated EggDistributionEntryProto egg_distribution = 1;
    HoloPokemonId hatch_pokemon_id = 2;
}
```

### 这里每个名字的准确叫法

#### 第一层 message

```proto
message EggDistributionProto {
```

- `message`: 关键字
- `EggDistributionProto`: message 类型名

这里的 `EggDistributionProto` 是外层 message 的类型名。

#### 嵌套 message

```proto
message EggDistributionEntryProto {
```

- `message`: 关键字
- `EggDistributionEntryProto`: message 类型名

这里的 `EggDistributionEntryProto` 也是一个 message 类型名，只不过它是嵌套在 `EggDistributionProto` 里面的。

如果写完整路径，可以理解成：

`EggDistributionProto.EggDistributionEntryProto`

#### 这一句最关键

```proto
HoloPokemonClass rarity = 1;
```

- `HoloPokemonClass`: 字段类型名
- 如果它本身是 enum，那么更准确地说，这是 enum 类型名
- `rarity`: 字段名
- `1`: 字段编号

这里真正写进 protobuf wire data 的，不是 `"COMMON"` 这种名字，而是 enum 对应的数字值。

所以：

- 数字值：原始 enum 数值
- 可读名字：根据 enum 类型表查出来的名字

例如：

- 数字值可能是 `3`
- 之后才被映射成某个名字，比如 `"COMMON"` 或别的枚举名

### 结合你的业务语义来理解

如果：

```proto
HoloPokemonClass rarity = 1;
```

里的 `HoloPokemonClass` 只是一个临时顶替的重定向类型，那么当前最稳的做法就是：

- 先保留 `rarity` 的数字值
- 之后等类型名修正，再重新解释数字对应的含义

这样你不会因为一开始映射成了某个错误名字，后面就失去回溯空间。

## 其他字段的准确叫法

### `HoloPokemonId pokemon_id = 2;`

- `HoloPokemonId`: 字段类型名
- 如果它是 enum，那么这是 enum 类型名
- `pokemon_id`: 字段名
- `2`: 字段编号

### `PokemonDisplayProto pokemon_display = 3;`

- `PokemonDisplayProto`: 字段类型名
- 如果它本身是 `message`，那么更准确地说，这是 message 类型名
- `pokemon_display`: 字段名
- `3`: 字段编号

这类字段和 enum 字段不一样。它的原始值不是一个简单数字，而是一段嵌套 message 的字节内容。

### `float shiny_rate = 4;`

- `float`: 标量类型
- `shiny_rate`: 字段名
- `4`: 字段编号

### `repeated EggDistributionEntryProto egg_distribution = 1;`

- `repeated`: 重复字段修饰符
- `EggDistributionEntryProto`: 字段类型名
- 这里它引用的是一个 message 类型
- `egg_distribution`: 字段名
- `1`: 字段编号

语义上它表示：

- 这是一个 repeated message field
- 也就是“一个由多个 `EggDistributionEntryProto` 组成的列表字段”

### `HoloPokemonId hatch_pokemon_id = 2;`

- `HoloPokemonId`: 字段类型名
- `hatch_pokemon_id`: 字段名
- `2`: 字段编号

## 一张速查表

### `.proto` 里最常见的几个术语

- `message`: 定义消息结构的关键字
- message 类型名: `message` 后面的名字，例如 `EggDistributionProto`
- 嵌套 message 类型名: 定义在另一个 message 里面的 message 名字，例如 `EggDistributionEntryProto`
- 字段类型名: 字段左边的类型名，例如 `HoloPokemonClass`、`PokemonDisplayProto`
- 字段名: 字段真正的名字，例如 `rarity`、`pokemon_display`
- 字段编号: `= 1` 里的数字
- enum 数字值: protobuf 里实际编码保存的枚举整数
- enum 名字: 由数字值映射出来的可读字符串

## 当前代码命名和业务理解的关系

当前代码里的命名大致可以理解成：

- `raw`: 原始数据
- `unparser`: 保留数字 enum 的版本
- `parser`: 转成可读 enum 名字的版本

注意：

- 这里的 `unparser` 不是“完全不解析”
- 它只是“尽量少做 enum 语义映射”

所以从业务上仍然可以把它理解成：

`raw` -> 数字版 -> 可读版

## 再补一条经验判断

如果错的是 enum 类型名：

- 保留数字值通常就够以后重新映射

如果错的是 message 类型名：

- 只保留展开后的 JSON 通常不够
- 最稳的还是保留 `raw`
- 之后再按修正后的 message 类型重新 parse

## 最后一句总结

我这里要保留 `raw`、数字版、可读版，不是因为完全不信 proto，而是因为：

- proto 可能是手工提取的
- 中间可能有临时占位类型
- 需要为以后修正类型名后的重新解释留出空间
- 同时还要能完整倒查 MITM 的每一次观测结果
