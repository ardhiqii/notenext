FROM golang:1.25.5-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o main ./cmd/api

FROM alpine:3.23
WORKDIR /app
RUN apk add --no-cache ca-certifactes
COPY --from=builder /app/main .
EXPOSE 8080
CMD [ "./main" ]