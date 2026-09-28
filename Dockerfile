# ---------- build ----------
FROM golang:1.25-alpine AS build
WORKDIR /src
# 国内构建可取消下一行注释换用代理
# ENV GOPROXY=https://mirrors.tencent.com/go,https://goproxy.cn,direct
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/sshweb .

# ---------- run ----------
FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata && addgroup -S sshweb && adduser -S sshweb -G sshweb
ENV TZ=Asia/Shanghai
WORKDIR /app
COPY --from=build /out/sshweb /app/sshweb
RUN mkdir -p /data && chown sshweb:sshweb /data
USER sshweb
VOLUME ["/data"]
EXPOSE 45678
# 首次启动的管理密码；已存在数据目录时以 SQLite(sshweb.db) 为准
ENV SSHWEB_PASSWORD=""
ENTRYPOINT ["/app/sshweb"]
CMD ["-listen", ":45678", "-data", "/data"]
